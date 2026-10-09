import { describe, expect, it } from "vitest";

import { parseAmount, parseCsv, suggestCategory, toCsv } from "@/lib/csv";
import { cashBalance, dateInputValue, defaultProfile, forecastCash, getInsights, getStatements, parseLedger, type Planned, type Tx } from "@/lib/financials";
import { localFinixReply } from "@/lib/finix-local";
import { installment, lenders, scoreLender } from "@/lib/scoring";

const DAY = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const inDays = (n: number) => dateInputValue(new Date(Date.now() + n * DAY));
const tx = (type: Tx["type"], amount: number, category: Tx["category"], ago: number): Tx => ({ id: `${type}-${category}-${ago}`, title: category, amount, type, category, date: daysAgo(ago) });
const plan = (kind: Planned["kind"], amount: number, due: number, done = false): Planned => ({ id: `${kind}-${due}`, kind, label: kind === "debt" ? "Utang tepung" : "Restok besar", amount, due: inDays(due), done });

const ledger: Tx[] = [
  tx("income", 3000000, "Penjualan", 2),
  tx("expense", 1200000, "Bahan baku", 3),
  tx("expense", 500000, "Pengiriman", 4),
  tx("income", 2500000, "Penjualan", 35),
  tx("expense", 1000000, "Bahan baku", 36),
  tx("expense", 200000, "Pengiriman", 37),
];
const cash = 2600000; // sum of the ledger above

describe("laporan keuangan", () => {
  it("menjaga neraca tetap seimbang, termasuk utang yang belum dibayar", () => {
    const profile = { ...defaultProfile, openingCash: 1234000, inventory: 10000, equipment: 999000 };
    const { balanceSheet, cash: shown } = getStatements(ledger, "year", profile, [plan("debt", 55000, 5), plan("debt", 99000, 6, true)]);
    const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);

    expect(sum(balanceSheet.assets)).toBe(sum(balanceSheet.liabilities) + sum(balanceSheet.equity));
    expect(balanceSheet.liabilities[0]!.value).toBe(55000);
    expect(shown).toBe(cashBalance(ledger, profile));
  });

  it("membuang transaksi yang rusak saat memuat data", () => {
    const parsed = parseLedger([ledger[0], { amount: -5, type: "income", date: daysAgo(1) }, { amount: 10, type: "lain", date: daysAgo(1) }, "x"]);

    expect(parsed).toHaveLength(1);
  });
});

describe("proyeksi kas 30 hari", () => {
  it("tidak minus bila pemasukan lebih besar dan tidak ada kewajiban", () => {
    const f = forecastCash(ledger, defaultProfile, []);

    expect(f.cash).toBe(cash);
    expect(f.deficit).toBeNull();
  });

  it("menemukan hari pertama kas minus dan kewajiban pemicunya", () => {
    const f = forecastCash(ledger, defaultProfile, [plan("debt", 750000, 5), plan("expense", 3000000, 9)]);

    expect(f.deficit?.day).toBe(9);
    expect(f.deficit?.trigger?.label).toBe("Restok besar");
    // hari ke-9: 2.600.000 + 9 x (100.000 - 56.667) - 3.750.000
    expect(f.deficit?.shortfall).toBe(760000);
  });

  it("mengabaikan kewajiban yang sudah dibayar", () => {
    expect(forecastCash(ledger, defaultProfile, [plan("expense", 9000000, 3, true)]).deficit).toBeNull();
  });
});

describe("peringatan dari catatan", () => {
  it("menandai biaya yang naik dan pemasukan yang naik", () => {
    const titles = getInsights(ledger, defaultProfile).map((i) => i.title);

    expect(titles).toContain("Biaya pengiriman naik 150%");
    expect(titles).toContain("Pemasukan naik 20%");
  });

  it("memberi peringatan bahaya saat kas akan minus dalam 14 hari", () => {
    const first = getInsights(ledger, defaultProfile, [plan("expense", 3000000, 9)])[0];

    expect(first).toMatchObject({ level: "danger", title: "Kas diperkirakan minus dalam 9 hari", action: "loan" });
  });

  it("mengingatkan utang yang jatuh tempo dalam 7 hari", () => {
    const titles = getInsights(ledger, defaultProfile, [plan("debt", 100000, 5)]).map((i) => i.title);

    expect(titles).toContain("Utang tepung jatuh tempo 5 hari lagi");
  });
});

describe("skor pembiayaan", () => {
  const kur = lenders.find((l) => l.name === "KUR Mikro")!;
  const supplier = lenders.find((l) => l.name === "Pembiayaan Pemasok")!;

  it("menghitung cicilan bunga flat sesuai rumus", () => {
    expect(installment(5000000, 0.06, 24)).toBe(233333);
  });

  it("memberi skor tinggi dengan alasan saat cicilan ringan", () => {
    const m = scoreLender(kur, 5000000, "Tambah stok", 24, 2000000);

    expect(m).toMatchObject({ eligible: true, risk: false, installment: 233333, cap: 600000 });
    expect(m.score).toBe(40 + 20 + 20 + 10 + 5);
    expect(m.factors).toHaveLength(5);
  });

  it("membatasi skor di bawah 30 saat cicilan melewati 30% laba", () => {
    const m = scoreLender(kur, 5000000, "Tambah stok", 24, 500000);

    expect(m.risk).toBe(true);
    expect(m.score).toBeLessThan(30);
  });

  it("menolak jumlah di atas batas produk dan tujuan yang tidak dilayani", () => {
    expect(scoreLender(supplier, 20000000, "Tambah stok", 12, 5000000)).toMatchObject({ eligible: false, score: 0 });
    expect(scoreLender(supplier, 5000000, "Beli alat", 12, 5000000).eligible).toBe(false);
  });

  it("menyesuaikan tenor yang tidak tersedia", () => {
    const m = scoreLender(supplier, 4000000, "Tambah stok", 24, 9000000);

    expect(m.tenor).toBe(2);
    expect(m.installment).toBe(2040000); // 2% untuk 60 hari, dua kali bayar
  });
});

describe("impor CSV", () => {
  it("membaca angka format Indonesia", () => {
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("Rp 250,000")).toBe(250000);
    expect(parseAmount("75000")).toBe(75000);
    expect(parseAmount("Rp1.250.000,50")).toBe(1250001);
    expect(parseAmount("NOT_A_NUMBER")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });

  it("membaca baris valid dan melaporkan baris yang salah", () => {
    const { rows, errors } = parseCsv(
      [
        "tanggal,jenis,jumlah,kategori,keterangan",
        "2026-10-09,pemasukan,1.500.000,Penjualan,Roti manis pagi",
        '09/10/2026,pengeluaran,"Rp 250,000",Bahan baku,"Dus, kraft"',
        "31/02/2026,pengeluaran,5000,Lainnya,tanggal mustahil",
        "2026-10-09,pengeluaran,abc,Lainnya,jumlah salah",
      ].join("\n"),
    );

    expect(rows.map((r) => [r.type, r.amount, r.category, r.title])).toEqual([
      ["income", 1500000, "Penjualan", "Roti manis pagi"],
      ["expense", 250000, "Bahan baku", "Dus, kraft"],
    ]);
    expect(errors.map((e) => e.line)).toEqual([4, 5]);
  });

  it("menebak jenis dan kategori dari keterangan bila kolomnya kosong", () => {
    const { rows } = parseCsv("tanggal;jumlah;keterangan\n09/10/2026;45.000;Ongkir kurir bahan\n09/10/2026;300.000;Penjualan roti");

    expect(rows.map((r) => [r.type, r.category])).toEqual([
      ["expense", "Pengiriman"],
      ["income", "Penjualan"],
    ]);
  });

  it("bisa membaca kembali berkas yang diekspornya sendiri", () => {
    const { rows, errors } = parseCsv(toCsv(ledger));

    expect(errors).toHaveLength(0);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(ledger.reduce((s, r) => s + r.amount, 0));
  });

  it("menyarankan kategori dari kata kunci", () => {
    expect(suggestCategory("Beli tepung dan telur", "expense")).toBe("Bahan baku");
    expect(suggestCategory("Token listrik", "expense")).toBe("Listrik & gas");
    expect(suggestCategory("Lain-lain", "expense")).toBeNull();
  });
});

describe("Finix mode demo", () => {
  it("menghitung target omzet dari data 30 hari terakhir", () => {
    expect(localFinixReply("Aku mau omzet bulan depan naik 20%", ledger, defaultProfile)).toContain("Rp3.600.000");
  });

  it("menyebut proyeksi kas saat ditanya kondisi keuangan", () => {
    const reply = localFinixReply("Gimana kondisi keuanganku?", ledger, defaultProfile, [plan("expense", 3000000, 9)]);

    expect(reply).toContain("minus pada hari ke-9");
  });
});
