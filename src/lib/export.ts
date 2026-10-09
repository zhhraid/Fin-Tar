import { getCreditProfile, getStatements, payableTotal, periodRange, periods, rp, type Activity, type PeriodKey, type Planned, type Profile, type Tx } from "./financials";
import { toCsv } from "./csv";

// File exports. The PDF library is loaded only when a download is requested.

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "usaha";
const money = (n: number) => (n < 0 ? `(${rp(-n)})` : rp(n));
const today = () => new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

type Table = { title: string; rows: [string, string][]; bold?: number[] };

async function buildPdf(heading: string, subtitle: string, tables: Table[], footer: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF();
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(heading, 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, 14, 19);

  let y = 36;
  for (const table of tables) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(table.title, 14, y);
    autoTable(doc, {
      startY: y + 3,
      body: table.rows,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (table.bold?.includes(data.row.index)) data.cell.styles.fontStyle = "bold";
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 11;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 150);
  doc.text(doc.splitTextToSize(footer, 180) as string[], 14, y);
  return doc;
}

function statementTables(all: Tx[], period: PeriodKey, profile: Profile, planned: Planned[]): Table[] {
  const { incomeStatement, totals, cashFlow, balanceSheet, cash } = getStatements(all, period, profile, planned);
  const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);
  const pnl: [string, string][] = [
    ...incomeStatement.revenue.map((r): [string, string] => [`Pendapatan: ${r.label}`, money(r.value)]),
    ...incomeStatement.cogs.map((r): [string, string] => [`Harga pokok: ${r.label}`, money(-r.value)]),
    ["Laba kotor", money(totals.gross)],
    ...incomeStatement.opex.map((r): [string, string] => [`Beban: ${r.label}`, money(-r.value)]),
    ["Laba bersih", money(totals.net)],
  ];
  const grossAt = incomeStatement.revenue.length + incomeStatement.cogs.length;
  return [
    { title: "Laporan Laba Rugi", rows: pnl, bold: [grossAt, pnl.length - 1] },
    { title: "Laporan Arus Kas", rows: [...cashFlow.map((c): [string, string] => [c.label, money(c.value)]), ["Kenaikan kas bersih", money(sum(cashFlow))], ["Saldo kas akhir", money(cash)]], bold: [cashFlow.length, cashFlow.length + 1] },
    {
      title: "Neraca Ringkas",
      rows: [
        ...balanceSheet.assets.map((r): [string, string] => [r.label, money(r.value)]),
        ["Total aset", money(sum(balanceSheet.assets))],
        ...balanceSheet.liabilities.map((r): [string, string] => [r.label, money(r.value)]),
        ...balanceSheet.equity.map((r): [string, string] => [r.label, money(r.value)]),
        ["Total kewajiban + ekuitas", money(sum(balanceSheet.liabilities) + sum(balanceSheet.equity))],
      ],
      bold: [balanceSheet.assets.length, balanceSheet.assets.length + balanceSheet.liabilities.length + balanceSheet.equity.length + 1],
    },
  ];
}

export async function exportReportPdf(all: Tx[], period: PeriodKey, profile: Profile, planned: Planned[]) {
  const label = periods.find((p) => p.key === period)!.label;
  const doc = await buildPdf("Laporan Keuangan", `${profile.name} - ${periodRange(period).label}`, statementTables(all, period, profile, planned), `Dibuat oleh FinTar pada ${today()}. Semua angka dihitung dari transaksi yang dicatat pemilik usaha. Persediaan dan peralatan adalah nilai yang diisi pemilik.`);
  doc.save(`FinTar_Laporan_${slug(profile.name)}_${slug(label)}.pdf`);
}

export type ProposalInput = { lender: string; amount: number; purpose: string; tenor: number; installment: number };

export async function exportProposalPdf(input: ProposalInput, all: Tx[], profile: Profile, planned: Planned[]) {
  const credit = getCreditProfile(all);
  const tables: Table[] = [
    { title: "Profil usaha", rows: [["Nama usaha", profile.name], ["Kategori", profile.category], ["Lama pencatatan", `${credit.recordedDays} hari, ${credit.txCount} transaksi`]] },
    {
      title: "Pinjaman yang diajukan",
      rows: [["Lembaga tujuan", input.lender], ["Jumlah", rp(input.amount)], ["Tujuan", input.purpose], ["Tenor", `${input.tenor} bulan`], ["Angsuran per bulan", rp(input.installment)], ["Porsi dari laba bulanan", credit.monthlyProfit > 0 ? `${Math.round((input.installment / credit.monthlyProfit) * 100)}%` : "-"]],
      bold: [1],
    },
    { title: "Ringkasan keuangan (rata-rata 3 bulan terakhir)", rows: [["Omzet per bulan", rp(credit.monthlyRevenue)], ["Laba bersih per bulan", rp(credit.monthlyProfit)], ["Margin bersih", `${(credit.margin * 100).toFixed(1)}%`], ["Utang pemasok berjalan", rp(payableTotal(planned))]] },
    ...statementTables(all, "quarter", profile, planned).map((t) => ({ ...t, title: `${t.title} (3 bulan)` })),
  ];
  const doc = await buildPdf("Proposal Pengajuan Modal Usaha", `${profile.name} - ${today()}`, tables, "Dokumen ini dibuat otomatis oleh FinTar dari catatan transaksi pemilik usaha dan bersifat simulasi. Keputusan pembiayaan sepenuhnya berada di lembaga keuangan berizin.");
  doc.save(`FinTar_Proposal_${slug(profile.name)}_${slug(input.lender)}.pdf`);
}

export const exportTransactionsCsv = (txs: Tx[], profile: Profile) => download(`FinTar_Transaksi_${slug(profile.name)}.csv`, new Blob([toCsv(txs)], { type: "text/csv;charset=utf-8" }));
export const exportActivityJson = (rows: Activity[]) => download("FinTar_Log_Aktivitas.json", new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
