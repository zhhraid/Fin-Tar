import { useSyncExternalStore } from "react";

export const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

/* ---------- Ledger ---------- */
export type Category = "Penjualan" | "Pemasukan lain" | "Bahan baku" | "Pengiriman" | "Listrik & gas" | "Upah karyawan" | "Lainnya";
export const incomeCategories: Category[] = ["Penjualan", "Pemasukan lain"];
export const expenseCategories: Category[] = ["Bahan baku", "Pengiriman", "Listrik & gas", "Upah karyawan", "Lainnya"];
const COGS: Category[] = ["Bahan baku"];

export type Tx = { id: string; title: string; amount: number; type: "income" | "expense"; category: Category; date: string; source?: "manual" | "scan" };

const STORAGE_KEY = "fintar-ledger-v1";
const DAY = 86400000;

function buildSeed(): Tx[] {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const t = now.getTime();
  const rows: [number, string, number, Tx["type"], Category][] = [];
  // three months of history, newest first offsets in days
  for (let m = 0; m < 3; m++) {
    const o = m * 30;
    const k = m === 0 ? 1 : m === 1 ? 0.92 : 0.85;
    rows.push(
      [o + 1, "Penjualan harian", 890000 * k, "income", "Penjualan"],
      [o + 8, "Penjualan mingguan", 760000 * k, "income", "Penjualan"],
      [o + 15, "Pesanan katering", 657000 * k, "income", "Penjualan"],
      [o + 22, "Penjualan harian", 600000 * k, "income", "Penjualan"],
      [o + 0, "Restok bahan baku", 245000 * k, "expense", "Bahan baku"],
      [o + 12, "Tepung & telur", 875000 * k, "expense", "Bahan baku"],
      [o + 2, "Biaya pengiriman", 85000 * k, "expense", "Pengiriman"],
      [o + 18, "Kurir pesanan", 200000 * k, "expense", "Pengiriman"],
      [o + 10, "Listrik & gas", 252000 * k, "expense", "Listrik & gas"],
      [o + 20, "Upah paruh waktu", 150000 * k, "expense", "Upah karyawan"],
    );
  }
  return rows.map(([d, title, amount, type, category], i) => ({
    id: `seed-${i}`,
    title,
    amount: Math.round(amount / 1000) * 1000,
    type,
    category,
    date: new Date(t - d * DAY).toISOString(),
  }));
}

const seed = buildSeed();
let state: Tx[] = seed;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as Tx[];
  } catch {
    /* keep seed */
  }
}
function commit(next: Tx[]) {
  state = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function addTransaction(tx: Omit<Tx, "id" | "date"> & { date?: string }) {
  load();
  commit([{ ...tx, id: crypto.randomUUID(), date: tx.date ?? new Date().toISOString() }, ...state]);
}
export function removeTransaction(id: string) {
  load();
  commit(state.filter((t) => t.id !== id));
}
export function resetLedger() {
  commit(buildSeed());
}

export function useLedger(): Tx[] {
  return useSyncExternalStore(
    (cb) => {
      load();
      listeners.add(cb);
      cb();
      return () => listeners.delete(cb);
    },
    () => (load(), state),
    () => seed,
  );
}

/* ---------- Periods & statements ---------- */
export type PeriodKey = "week" | "month" | "quarter" | "year";
const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function periodRange(key: PeriodKey, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === "week") start.setDate(start.getDate() - 6);
  if (key === "month") start.setDate(1);
  if (key === "quarter") { start.setMonth(start.getMonth() - 2); start.setDate(1); }
  if (key === "year") { start.setMonth(0); start.setDate(1); }
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}
export const periods: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "7 hari" },
  { key: "month", label: "Bulan ini" },
  { key: "quarter", label: "3 bulan" },
  { key: "year", label: "Tahun ini" },
];

export function filterPeriod(txs: Tx[], key: PeriodKey) {
  const { start, end } = periodRange(key);
  return txs.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
}

const group = (txs: Tx[]) => {
  const m = new Map<string, number>();
  txs.forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + t.amount));
  return [...m.entries()].map(([label, value]) => ({ label, value }));
};

export function summarize(txs: Tx[]) {
  const income = txs.filter((t) => t.type === "income");
  const expense = txs.filter((t) => t.type === "expense");
  const revenue = income.reduce((s, t) => s + t.amount, 0);
  const cogs = expense.filter((t) => COGS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const opex = expense.filter((t) => !COGS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const gross = revenue - cogs;
  return { revenue, cogs, opex, gross, net: gross - opex, expense: cogs + opex };
}

export function getStatements(all: Tx[], key: PeriodKey) {
  const txs = filterPeriod(all, key);
  const totals = summarize(txs);
  const allNet = summarize(all).net;
  const expense = txs.filter((t) => t.type === "expense");
  const incomeStatement = {
    revenue: group(txs.filter((t) => t.type === "income")),
    cogs: group(expense.filter((t) => COGS.includes(t.category))),
    opex: group(expense.filter((t) => !COGS.includes(t.category))),
  };
  const cashFlow = [
    { label: "Kas masuk dari pelanggan", value: totals.revenue },
    { label: "Kas keluar ke pemasok & biaya", value: -totals.expense },
    { label: "Aktivitas investasi", value: 0 },
    { label: "Aktivitas pendanaan", value: 0 },
  ];
  const balanceSheet = {
    assets: [
      { label: "Kas", value: allNet },
      { label: "Persediaan bahan", value: 650000 },
      { label: "Peralatan (oven, mixer)", value: 4500000 },
    ],
    liabilities: [{ label: "Utang ke pemasok", value: 750000 }],
    equity: [
      { label: "Modal pemilik", value: 4400000 },
      { label: "Laba ditahan", value: allNet - totals.net },
      { label: "Laba periode berjalan", value: totals.net },
    ],
  };
  return { txs, incomeStatement, totals, cashFlow, balanceSheet };
}

export const cashAlerts = [
  { level: "danger", title: "Kas diperkirakan menipis dalam 9 hari", text: "Restok Ramadan sekitar Rp1,4 jt bisa melebihi saldo kas. Siapkan modal atau tunda sebagian belanja." },
  { level: "warning", title: "Utang pemasok Rp750.000 jatuh tempo minggu depan", text: "Sisihkan dana dari penjualan 3 hari ke depan agar tidak telat bayar." },
  { level: "warning", title: "Biaya pengiriman naik 18%", text: "Pertimbangkan minimum order untuk gratis ongkir." },
  { level: "success", title: "Penjualan naik 10% minggu ini", text: "Tren positif menjelang Ramadan — pertahankan stok produk terlaris." },
] as const;

export function buildFinancialContext(all: Tx[]) {
  const m = getStatements(all, "month");
  const t = m.totals;
  const pct = (n: number) => (t.revenue ? ((n / t.revenue) * 100).toFixed(1) : "0");
  const recent = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
    .map((x) => `${x.title} ${x.type === "income" ? "+" : "-"}${rp(x.amount)} (${x.category}, ${new Date(x.date).toLocaleDateString("id-ID")})`).join("; ");
  return `Usaha: Viera Bakery (toko roti). Data bulan ini (dari catatan transaksi pengguna):
Pendapatan ${rp(t.revenue)}; HPP ${rp(t.cogs)}; Laba kotor ${rp(t.gross)}; Beban operasional ${rp(t.opex)} (${m.incomeStatement.opex.map((o) => `${o.label} ${rp(o.value)}`).join(", ")}); Laba bersih ${rp(t.net)}. Margin kotor ${pct(t.gross)}%, margin bersih ${pct(t.net)}%.
Saldo kas total ${rp(summarize(all).net)}. Utang pemasok Rp750.000, peralatan Rp4.500.000, persediaan Rp650.000.
Peringatan arus kas: ${cashAlerts.map((a) => a.title).join("; ")}.
Opsi pembiayaan di aplikasi: KUR Mikro (6%/thn), Koperasi UMKM (12%/thn), Pembiayaan Pemasok (tempo 60 hari, 2%), Pinjaman Digital Produktif (24%/thn). Asuransi toko: Kebakaran & bencana, Pencurian, Gangguan usaha, Kesehatan karyawan.
Transaksi terbaru: ${recent}.`;
}
