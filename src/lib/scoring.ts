// Financing match score (PRD section 9), out of 100:
// kemampuan bayar 40, kecocokan tujuan & tenor 20, agunan 20, biaya 10, kecepatan 10.
// A monthly installment above 30% of average profit caps the score below 30.
import type { Language } from "./i18n";

export type Lender = {
  name: string;
  type: string;
  /** Flat annual rate, e.g. 0.06 for 6%. */
  rate: number;
  max: number;
  tenors: number[];
  purposes: string[];
  days: number;
  daysLabel: string;
  collateralFreeUpTo: number;
  note: string;
  /** English text for the fields shown to the user. */
  en: { type: string; daysLabel: string; note: string };
};

// Purposes are stored as these Indonesian keys (also by the agent); only the label is translated.
const purposeEn: Record<string, string> = { "Tambah stok": "Restock inventory", "Beli alat": "Buy equipment", "Renovasi toko": "Shop renovation" };
export const purposeKeys = Object.keys(purposeEn);
export const purposeLabel = (p: string, lang: Language) => (lang === "en" ? (purposeEn[p] ?? p) : p);
// Lender names are keys (the agent refers to them); English screens show these names instead.
const lenderEn: Record<string, string> = { "Koperasi UMKM": "UMKM Cooperative", "Pembiayaan Pemasok": "Supplier Financing", "Pinjaman Digital Produktif": "Productive Digital Loan" };
export const lenderName = (name: string, lang: Language) => (lang === "en" ? (lenderEn[name] ?? name) : name);
export const lenderText = (l: Lender, lang: Language) => (lang === "en" ? l.en : { type: l.type, daysLabel: l.daysLabel, note: l.note });

// Example products for the simulation; not real offers.
export const lenders: Lender[] = [
  { name: "KUR Mikro", type: "Bank penyalur KUR", rate: 0.06, max: 50000000, tenors: [6, 12, 24], purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: 6, daysLabel: "5–7 hari", collateralFreeUpTo: 10000000, note: "Bunga disubsidi pemerintah", en: { type: "KUR distributing bank", daysLabel: "5–7 days", note: "Government-subsidised interest" } },
  { name: "Koperasi UMKM", type: "Koperasi simpan pinjam", rate: 0.12, max: 25000000, tenors: [6, 12, 24], purposes: ["Tambah stok", "Renovasi toko"], days: 3, daysLabel: "2–3 hari", collateralFreeUpTo: 10000000, note: "Tanpa agunan s.d. Rp10 jt", en: { type: "Savings & loan cooperative", daysLabel: "2–3 days", note: "No collateral up to Rp10M" } },
  { name: "Pembiayaan Pemasok", type: "Tempo bayar bahan baku", rate: 0.12, max: 10000000, tenors: [2], purposes: ["Tambah stok"], days: 0, daysLabel: "Instan", collateralFreeUpTo: 10000000, note: "Bayar dalam 60 hari setelah barang diterima", en: { type: "Deferred payment for ingredients", daysLabel: "Instant", note: "Pay within 60 days after the goods arrive" } },
  { name: "Pinjaman Digital Produktif", type: "Platform berizin OJK", rate: 0.24, max: 20000000, tenors: [6, 12], purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: 1, daysLabel: "1 hari", collateralFreeUpTo: 20000000, note: "Cair cepat, bunga lebih tinggi", en: { type: "OJK-licensed platform", daysLabel: "1 day", note: "Fast disbursement, higher interest" } },
];

/** Flat-interest installment: P * (1 + rate * months / 12) / months. */
export const installment = (principal: number, rate: number, months: number) => (months > 0 ? Math.round((principal * (1 + (rate * months) / 12)) / months) : 0);
export const healthyCap = (monthlyProfit: number) => (monthlyProfit > 0 ? Math.round(monthlyProfit * 0.3) : 0);

export type Factor = { label: string; points: number; max: number; reason: string };
export type LenderMatch = { lender: Lender; eligible: boolean; blocker: string | null; tenor: number; installment: number; cap: number; risk: boolean; score: number; factors: Factor[] };

const juta = (n: number, lang: Language) => (lang === "en" ? `Rp${n / 1e6}M` : `Rp${n / 1e6} jt`);

export function scoreLender(lender: Lender, amount: number, purpose: string, wantedTenor: number, monthlyProfit: number, lang: Language = "id"): LenderMatch {
  const L = (en: string, id: string) => (lang === "en" ? en : id);
  const goal = purposeLabel(purpose, lang);
  // A product that does not offer the requested tenor is priced at its closest one.
  const tenor = lender.tenors.includes(wantedTenor) ? wantedTenor : [...lender.tenors].sort((a, b) => Math.abs(a - wantedTenor) - Math.abs(b - wantedTenor))[0]!;
  const pay = installment(amount, lender.rate, tenor);
  const cap = healthyCap(monthlyProfit);
  const base = { lender, tenor, installment: pay, cap };

  const blocker = amount > lender.max ? L(`Maximum loan ${juta(lender.max, lang)}`, `Maksimal pinjaman ${juta(lender.max, lang)}`) : !lender.purposes.includes(purpose) ? L(`Does not serve "${goal}"`, `Tidak melayani tujuan "${goal}"`) : null;
  if (blocker) return { ...base, eligible: false, blocker, risk: false, score: 0, factors: [] };

  const risk = pay > cap;
  const share = monthlyProfit > 0 ? Math.round((pay / monthlyProfit) * 100) : null;
  const pay_ = L("Repayment capacity", "Kemampuan bayar");
  const fit = L("Purpose & tenor", "Tujuan & tenor");
  const coll = L("Collateral", "Agunan");
  const factors: Factor[] = [
    pay <= cap * 0.7
      ? { label: pay_, points: 40, max: 40, reason: L(`Light installment, ${share}% of monthly profit`, `Cicilan ringan, ${share}% dari laba bulanan`) }
      : pay <= cap
        ? { label: pay_, points: 30, max: 40, reason: L(`Installment is ${share}% of profit, still under the 30% safe cap`, `Cicilan ${share}% dari laba, masih di bawah batas aman 30%`) }
        : { label: pay_, points: 5, max: 40, reason: share === null ? L("No profit yet to cover an installment", "Belum ada laba untuk menanggung cicilan") : L(`Installment is ${share}% of profit, above the 30% safe cap`, `Cicilan ${share}% dari laba, melewati batas aman 30%`) },
    tenor === wantedTenor
      ? { label: fit, points: 20, max: 20, reason: L(`Serves "${goal}" with a ${tenor}-month tenor`, `Melayani "${goal}" dengan tenor ${tenor} bulan`) }
      : { label: fit, points: 10, max: 20, reason: L(`${wantedTenor}-month tenor not available, adjusted to ${tenor} months`, `Tenor ${wantedTenor} bulan tidak tersedia, disesuaikan jadi ${tenor} bulan`) },
    amount <= lender.collateralFreeUpTo
      ? { label: coll, points: 20, max: 20, reason: L("No collateral for this amount", "Tanpa agunan untuk jumlah ini") }
      : { label: coll, points: 10, max: 20, reason: L(`Collateral needed above ${juta(lender.collateralFreeUpTo, lang)}`, `Perlu agunan untuk pinjaman di atas ${juta(lender.collateralFreeUpTo, lang)}`) },
    { label: L("Cost", "Biaya"), points: lender.rate <= 0.08 ? 10 : lender.rate <= 0.15 ? 7 : 4, max: 10, reason: L(`${Math.round(lender.rate * 100)}% interest per year (flat)`, `Bunga ${Math.round(lender.rate * 100)}% per tahun (flat)`) },
    { label: L("Speed", "Kecepatan"), points: lender.days <= 1 ? 10 : lender.days <= 3 ? 8 : 5, max: 10, reason: L(`Expected disbursement: ${lender.en.daysLabel.toLowerCase()}`, `Perkiraan cair: ${lender.daysLabel.toLowerCase()}`) },
  ];
  const total = factors.reduce((s, f) => s + f.points, 0);
  return { ...base, eligible: true, blocker: null, risk, score: risk ? Math.min(28, Math.round(total * 0.28)) : total, factors };
}

export const rankLenders = (amount: number, purpose: string, tenor: number, monthlyProfit: number, lang: Language = "id") =>
  lenders.map((l) => scoreLender(l, amount, purpose, tenor, monthlyProfit, lang)).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
