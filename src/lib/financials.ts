export const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${Math.abs(n).toLocaleString("id-ID")}`;

export const incomeStatement = {
  revenue: [{ label: "Penjualan roti & kue", value: 2907000 }],
  cogs: [{ label: "Bahan baku (tepung, telur, cokelat)", value: 1120000 }],
  opex: [
    { label: "Biaya pengiriman", value: 285000 },
    { label: "Listrik & gas", value: 252000 },
    { label: "Upah karyawan paruh waktu", value: 150000 },
  ],
};

export const totals = (() => {
  const revenue = incomeStatement.revenue.reduce((s, i) => s + i.value, 0);
  const cogs = incomeStatement.cogs.reduce((s, i) => s + i.value, 0);
  const opex = incomeStatement.opex.reduce((s, i) => s + i.value, 0);
  const gross = revenue - cogs;
  const net = gross - opex;
  return { revenue, cogs, opex, gross, net };
})();

export const cashFlow = [
  { label: "Kas masuk dari pelanggan", value: 2907000 },
  { label: "Kas keluar ke pemasok & biaya", value: -1807000 },
  { label: "Aktivitas investasi", value: 0 },
  { label: "Aktivitas pendanaan", value: 0 },
];

export const balanceSheet = {
  assets: [
    { label: "Kas", value: 1100000 },
    { label: "Persediaan bahan", value: 650000 },
    { label: "Peralatan (oven, mixer)", value: 4500000 },
  ],
  liabilities: [{ label: "Utang ke pemasok", value: 750000 }],
  equity: [
    { label: "Modal pemilik", value: 4400000 },
    { label: "Laba periode berjalan", value: 1100000 },
  ],
};

export const FINANCIAL_CONTEXT = `Usaha: Viera Bakery (toko roti), periode Januari.
Laporan laba rugi: Pendapatan ${rp(totals.revenue)}; HPP ${rp(totals.cogs)}; Laba kotor ${rp(totals.gross)}; Beban operasional ${rp(totals.opex)} (${incomeStatement.opex.map((o) => `${o.label} ${rp(o.value)}`).join(", ")}); Laba bersih ${rp(totals.net)}.
Margin kotor ${((totals.gross / totals.revenue) * 100).toFixed(1)}%, margin bersih ${((totals.net / totals.revenue) * 100).toFixed(1)}%.
Arus kas: ${cashFlow.map((c) => `${c.label} ${rp(c.value)}`).join("; ")}. Saldo kas akhir Rp1.100.000.
Neraca: Aset ${balanceSheet.assets.map((a) => `${a.label} ${rp(a.value)}`).join(", ")} (total Rp6.250.000); Kewajiban: utang pemasok Rp750.000; Ekuitas: modal Rp4.400.000 + laba Rp1.100.000.
Transaksi terakhir: Restok bahan baku -Rp245.000 (4 Jan), Penjualan harian +Rp890.000 (3 Jan), Biaya pengiriman -Rp85.000 (2 Jan).
Tren: pendapatan minggu 1–7 Jan naik 10% dari minggu lalu. Bulan depan Ramadan; permintaan roti biasanya naik.`;
