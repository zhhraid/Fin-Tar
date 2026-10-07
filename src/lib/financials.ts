export const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

export type PeriodKey = "week" | "month" | "quarter" | "year";
export const periods: { key: PeriodKey; label: string; range: string; factor: number }[] = [
  { key: "week", label: "7 hari", range: "25–31 Januari", factor: 0.24 },
  { key: "month", label: "Bulan ini", range: "1–31 Januari", factor: 1 },
  { key: "quarter", label: "3 bulan", range: "November – Januari", factor: 2.9 },
  { key: "year", label: "Tahun ini", range: "Februari – Januari", factor: 11.6 },
];

const base = {
  revenue: [{ label: "Penjualan roti & kue", value: 2907000 }],
  cogs: [{ label: "Bahan baku (tepung, telur, cokelat)", value: 1120000 }],
  opex: [
    { label: "Biaya pengiriman", value: 285000 },
    { label: "Listrik & gas", value: 252000 },
    { label: "Upah karyawan paruh waktu", value: 150000 },
  ],
};

const r = (n: number) => Math.round(n / 1000) * 1000;
const sum = (l: { value: number }[]) => l.reduce((s, i) => s + i.value, 0);

export function getStatements(period: PeriodKey) {
  const f = periods.find((p) => p.key === period)!.factor;
  const scale = (l: { label: string; value: number }[]) => l.map((i) => ({ ...i, value: r(i.value * f) }));
  const incomeStatement = { revenue: scale(base.revenue), cogs: scale(base.cogs), opex: scale(base.opex) };
  const revenue = sum(incomeStatement.revenue);
  const cogs = sum(incomeStatement.cogs);
  const opex = sum(incomeStatement.opex);
  const gross = revenue - cogs;
  const net = gross - opex;
  const totals = { revenue, cogs, opex, gross, net };
  const cashFlow = [
    { label: "Kas masuk dari pelanggan", value: revenue },
    { label: "Kas keluar ke pemasok & biaya", value: -(cogs + opex) },
    { label: "Aktivitas investasi", value: 0 },
    { label: "Aktivitas pendanaan", value: 0 },
  ];
  const balanceSheet = {
    assets: [
      { label: "Kas", value: net },
      { label: "Persediaan bahan", value: 650000 },
      { label: "Peralatan (oven, mixer)", value: 4500000 },
    ],
    liabilities: [{ label: "Utang ke pemasok", value: 750000 }],
    equity: [
      { label: "Modal pemilik", value: 4400000 },
      { label: "Laba periode berjalan", value: net },
    ],
  };
  return { incomeStatement, totals, cashFlow, balanceSheet };
}

export const monthly = getStatements("month");
export const totals = monthly.totals;

export const cashAlerts = [
  { level: "danger", title: "Kas diperkirakan menipis dalam 9 hari", text: "Restok Ramadan sekitar Rp1,4 jt melebihi saldo kas Rp1,1 jt. Siapkan modal atau tunda sebagian belanja." },
  { level: "warning", title: "Utang pemasok Rp750.000 jatuh tempo 10 Jan", text: "Sisihkan dana dari penjualan 3 hari ke depan agar tidak telat bayar." },
  { level: "warning", title: "Biaya pengiriman naik 18%", text: "Pengiriman kini 26% dari beban operasional. Pertimbangkan minimum order untuk gratis ongkir." },
  { level: "success", title: "Penjualan naik 10% minggu ini", text: "Tren positif menjelang Ramadan — pertahankan stok produk terlaris." },
] as const;

export const FINANCIAL_CONTEXT = `Usaha: Viera Bakery (toko roti), periode Januari.
Laporan laba rugi: Pendapatan ${rp(totals.revenue)}; HPP ${rp(totals.cogs)}; Laba kotor ${rp(totals.gross)}; Beban operasional ${rp(totals.opex)} (${monthly.incomeStatement.opex.map((o) => `${o.label} ${rp(o.value)}`).join(", ")}); Laba bersih ${rp(totals.net)}.
Margin kotor ${((totals.gross / totals.revenue) * 100).toFixed(1)}%, margin bersih ${((totals.net / totals.revenue) * 100).toFixed(1)}%.
Arus kas bulan ini: masuk ${rp(totals.revenue)}, keluar ${rp(totals.cogs + totals.opex)}. Saldo kas akhir ${rp(totals.net)}.
Neraca: Kas ${rp(totals.net)}, persediaan Rp650.000, peralatan Rp4.500.000; utang pemasok Rp750.000; modal Rp4.400.000 + laba berjalan.
Peringatan arus kas aktif: ${cashAlerts.map((a) => a.title).join("; ")}.
Opsi pembiayaan di aplikasi: KUR Mikro (6%/thn), Koperasi UMKM (12%/thn), Pembiayaan Pemasok (tempo 60 hari, 2%), Pinjaman Digital Produktif (24%/thn). Asuransi toko: Kebakaran & bencana, Pencurian, Gangguan usaha, Kesehatan karyawan.
Transaksi terakhir: Restok bahan baku -Rp245.000 (4 Jan), Penjualan harian +Rp890.000 (3 Jan), Biaya pengiriman -Rp85.000 (2 Jan).
Tren: pendapatan minggu ini naik 10%. Bulan depan Ramadan; permintaan roti biasanya naik.`;
