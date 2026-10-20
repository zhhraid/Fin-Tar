import { categoryLabel, getCreditProfile, getStatements, payableTotal, periodRange, rp, type Activity, type Period, type Planned, type Profile, type Tx } from "./financials";
import type { Language } from "./i18n";
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
const locale = (lang: Language) => (lang === "en" ? "en-US" : "id-ID");
const today = (lang: Language) => new Date().toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric" });
const tl = (lang: Language, en: string, id: string) => (lang === "en" ? en : id);

/** Rows are label/value pairs unless `head` names more columns; the last column is right-aligned. */
type Table = { title: string; rows: string[][]; bold?: number[]; head?: string[] };

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
    // Start a table on a new page when its title and first rows would not fit (A4 is 297 mm tall).
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(table.title, 14, y);
    const lastCol = (table.head?.length ?? 2) - 1;
    autoTable(doc, {
      startY: y + 3,
      ...(table.head ? { head: [table.head], headStyles: { fillColor: [37, 99, 235] as [number, number, number], fontSize: 9 } } : {}),
      body: table.rows,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { [lastCol]: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === lastCol) data.cell.styles.halign = "right";
        if (data.section === "body" && table.bold?.includes(data.row.index)) data.cell.styles.fontStyle = "bold";
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 11;
  }
  if (y > 275) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 150);
  doc.text(doc.splitTextToSize(footer, 180) as string[], 14, y);
  return doc;
}

function statementTables(all: Tx[], period: Period, profile: Profile, planned: Planned[], lang: Language): Table[] {
  const L = (en: string, id: string) => tl(lang, en, id);
  const { incomeStatement, totals, cashFlow, balanceSheet, cash } = getStatements(all, period, profile, planned, lang);
  const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);
  const pnl: [string, string][] = [
    ...incomeStatement.revenue.map((r): [string, string] => [`${L("Revenue", "Pendapatan")}: ${r.label}`, money(r.value)]),
    ...incomeStatement.cogs.map((r): [string, string] => [`${L("Cost of goods", "Harga pokok")}: ${r.label}`, money(-r.value)]),
    [L("Gross profit", "Laba kotor"), money(totals.gross)],
    ...incomeStatement.opex.map((r): [string, string] => [`${L("Expense", "Beban")}: ${r.label}`, money(-r.value)]),
    [L("Net profit", "Laba bersih"), money(totals.net)],
  ];
  const grossAt = incomeStatement.revenue.length + incomeStatement.cogs.length;
  return [
    { title: L("Profit & Loss Statement", "Laporan Laba Rugi"), rows: pnl, bold: [grossAt, pnl.length - 1] },
    { title: L("Cash Flow Statement", "Laporan Arus Kas"), rows: [...cashFlow.map((c): [string, string] => [c.label, money(c.value)]), [L("Net cash increase", "Kenaikan kas bersih"), money(sum(cashFlow))], [L("Ending cash balance", "Saldo kas akhir"), money(cash)]], bold: [cashFlow.length, cashFlow.length + 1] },
    {
      title: L("Summary Balance Sheet", "Neraca Ringkas"),
      rows: [
        ...balanceSheet.assets.map((r): [string, string] => [r.label, money(r.value)]),
        [L("Total assets", "Total aset"), money(sum(balanceSheet.assets))],
        ...balanceSheet.liabilities.map((r): [string, string] => [r.label, money(r.value)]),
        ...balanceSheet.equity.map((r): [string, string] => [r.label, money(r.value)]),
        [L("Total liabilities + equity", "Total kewajiban + ekuitas"), money(sum(balanceSheet.liabilities) + sum(balanceSheet.equity))],
      ],
      bold: [balanceSheet.assets.length, balanceSheet.assets.length + balanceSheet.liabilities.length + balanceSheet.equity.length + 1],
    },
  ];
}

/** Every transaction in the period, newest first, so the totals above can be traced line by line. */
export function transactionTable(txs: Tx[], lang: Language = "id"): Table {
  const L = (en: string, id: string) => tl(lang, en, id);
  const rows = [...txs]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .map((t) => [new Date(t.date).toLocaleDateString(locale(lang), { day: "numeric", month: "short", year: "numeric" }), t.title, categoryLabel(t.category, lang), t.type === "income" ? `+${rp(t.amount)}` : money(-t.amount)]);
  return { title: L(`Transaction details (${txs.length})`, `Rincian transaksi (${txs.length})`), head: [L("Date", "Tanggal"), L("Description", "Keterangan"), L("Category", "Kategori"), L("Amount", "Jumlah")], rows: rows.length ? rows : [["-", L("No transactions in this period", "Belum ada transaksi di periode ini"), "-", "-"]] };
}

export function reportTables(all: Tx[], period: Period, profile: Profile, planned: Planned[], lang: Language = "id"): Table[] {
  return [...statementTables(all, period, profile, planned, lang), transactionTable(getStatements(all, period, profile, planned, lang).txs, lang)];
}

export async function exportReportPdf(all: Tx[], period: Period, profile: Profile, planned: Planned[], lang: Language = "id") {
  const { label } = periodRange(period, new Date(), lang);
  const footer = tl(lang, `Generated by FinTar on ${today(lang)}. All figures are calculated from transactions recorded by the business owner. Inventory and equipment are values entered by the owner.`, `Dibuat oleh FinTar pada ${today(lang)}. Semua angka dihitung dari transaksi yang dicatat pemilik usaha. Persediaan dan peralatan adalah nilai yang diisi pemilik.`);
  const doc = await buildPdf(tl(lang, "Financial Report", "Laporan Keuangan"), `${profile.name} - ${label}`, reportTables(all, period, profile, planned, lang), footer);
  doc.save(`FinTar_${tl(lang, "Report", "Laporan")}_${slug(profile.name)}_${slug(label)}.pdf`);
}

export type ProposalInput = { lender: string; amount: number; purpose: string; tenor: number; installment: number };

export async function exportProposalPdf(input: ProposalInput, all: Tx[], profile: Profile, planned: Planned[], lang: Language = "id") {
  const L = (en: string, id: string) => tl(lang, en, id);
  const credit = getCreditProfile(all);
  const tables: Table[] = [
    { title: L("Business profile", "Profil usaha"), rows: [[L("Business name", "Nama usaha"), profile.name], [L("Category", "Kategori"), profile.category], [L("Recording history", "Lama pencatatan"), L(`${credit.recordedDays} days, ${credit.txCount} transactions`, `${credit.recordedDays} hari, ${credit.txCount} transaksi`)]] },
    {
      title: L("Requested financing", "Pinjaman yang diajukan"),
      rows: [[L("Lender", "Lembaga tujuan"), input.lender], [L("Amount", "Jumlah"), rp(input.amount)], [L("Purpose", "Tujuan"), input.purpose], ["Tenor", L(`${input.tenor} months`, `${input.tenor} bulan`)], [L("Monthly installment", "Angsuran per bulan"), rp(input.installment)], [L("Share of monthly profit", "Porsi dari laba bulanan"), credit.monthlyProfit > 0 ? `${Math.round((input.installment / credit.monthlyProfit) * 100)}%` : "-"]],
      bold: [1],
    },
    { title: L("Financial summary (3-month average)", "Ringkasan keuangan (rata-rata 3 bulan terakhir)"), rows: [[L("Monthly sales", "Omzet per bulan"), rp(credit.monthlyRevenue)], [L("Monthly net profit", "Laba bersih per bulan"), rp(credit.monthlyProfit)], [L("Net margin", "Margin bersih"), `${(credit.margin * 100).toFixed(1)}%`], [L("Outstanding supplier debt", "Utang pemasok berjalan"), rp(payableTotal(planned))]] },
    ...statementTables(all, "quarter", profile, planned, lang).map((t) => ({ ...t, title: `${t.title} (${L("3 months", "3 bulan")})` })),
  ];
  const doc = await buildPdf(L("Business Financing Proposal", "Proposal Pengajuan Modal Usaha"), `${profile.name} - ${today(lang)}`, tables, L("This document was generated automatically by FinTar from the owner's transaction records and is a simulation. Financing decisions rest entirely with licensed financial institutions.", "Dokumen ini dibuat otomatis oleh FinTar dari catatan transaksi pemilik usaha dan bersifat simulasi. Keputusan pembiayaan sepenuhnya berada di lembaga keuangan berizin."));
  doc.save(`FinTar_Proposal_${slug(profile.name)}_${slug(input.lender)}.pdf`);
}

export const exportTransactionsCsv = (txs: Tx[], profile: Profile, lang: Language = "id") => download(`FinTar_${tl(lang, "Transactions", "Transaksi")}_${slug(profile.name)}.csv`, new Blob([toCsv(txs, lang)], { type: "text/csv;charset=utf-8" }));
/** The server's chain check, when there is one, goes in the file so the latest hash can be compared later. */
export const exportActivityJson = (rows: Activity[], chain: { total: number; valid: boolean; lastHash: string } | null = null) =>
  download("FinTar_Log_Aktivitas.json", new Blob([JSON.stringify(chain ? { exportedAt: new Date().toISOString(), chain, rows } : rows, null, 2)], { type: "application/json" }));
