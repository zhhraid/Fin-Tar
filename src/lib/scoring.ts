// Financing match score (PRD section 9), out of 100:
// kemampuan bayar 40, kecocokan tujuan & tenor 20, agunan 20, biaya 10, kecepatan 10.
// A monthly installment above 30% of average profit caps the score below 30.

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
};

// Example products for the simulation; not real offers.
export const lenders: Lender[] = [
  { name: "KUR Mikro", type: "Bank penyalur KUR", rate: 0.06, max: 50000000, tenors: [6, 12, 24], purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: 6, daysLabel: "5–7 hari", collateralFreeUpTo: 10000000, note: "Bunga disubsidi pemerintah" },
  { name: "Koperasi UMKM", type: "Koperasi simpan pinjam", rate: 0.12, max: 25000000, tenors: [6, 12, 24], purposes: ["Tambah stok", "Renovasi toko"], days: 3, daysLabel: "2–3 hari", collateralFreeUpTo: 10000000, note: "Tanpa agunan s.d. Rp10 jt" },
  { name: "Pembiayaan Pemasok", type: "Tempo bayar bahan baku", rate: 0.12, max: 10000000, tenors: [2], purposes: ["Tambah stok"], days: 0, daysLabel: "Instan", collateralFreeUpTo: 10000000, note: "Bayar dalam 60 hari setelah barang diterima" },
  { name: "Pinjaman Digital Produktif", type: "Platform berizin OJK", rate: 0.24, max: 20000000, tenors: [6, 12], purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: 1, daysLabel: "1 hari", collateralFreeUpTo: 20000000, note: "Cair cepat, bunga lebih tinggi" },
];

/** Flat-interest installment: P * (1 + rate * months / 12) / months. */
export const installment = (principal: number, rate: number, months: number) => (months > 0 ? Math.round((principal * (1 + (rate * months) / 12)) / months) : 0);
export const healthyCap = (monthlyProfit: number) => (monthlyProfit > 0 ? Math.round(monthlyProfit * 0.3) : 0);

export type Factor = { label: string; points: number; max: number; reason: string };
export type LenderMatch = { lender: Lender; eligible: boolean; blocker: string | null; tenor: number; installment: number; cap: number; risk: boolean; score: number; factors: Factor[] };

const juta = (n: number) => `Rp${n / 1e6} jt`;

export function scoreLender(lender: Lender, amount: number, purpose: string, wantedTenor: number, monthlyProfit: number): LenderMatch {
  // A product that does not offer the requested tenor is priced at its closest one.
  const tenor = lender.tenors.includes(wantedTenor) ? wantedTenor : [...lender.tenors].sort((a, b) => Math.abs(a - wantedTenor) - Math.abs(b - wantedTenor))[0]!;
  const pay = installment(amount, lender.rate, tenor);
  const cap = healthyCap(monthlyProfit);
  const base = { lender, tenor, installment: pay, cap };

  const blocker = amount > lender.max ? `Maksimal pinjaman ${juta(lender.max)}` : !lender.purposes.includes(purpose) ? `Tidak melayani tujuan "${purpose}"` : null;
  if (blocker) return { ...base, eligible: false, blocker, risk: false, score: 0, factors: [] };

  const risk = pay > cap;
  const share = monthlyProfit > 0 ? Math.round((pay / monthlyProfit) * 100) : null;
  const factors: Factor[] = [
    pay <= cap * 0.7
      ? { label: "Kemampuan bayar", points: 40, max: 40, reason: `Cicilan ringan, ${share}% dari laba bulanan` }
      : pay <= cap
        ? { label: "Kemampuan bayar", points: 30, max: 40, reason: `Cicilan ${share}% dari laba, masih di bawah batas aman 30%` }
        : { label: "Kemampuan bayar", points: 5, max: 40, reason: share === null ? "Belum ada laba untuk menanggung cicilan" : `Cicilan ${share}% dari laba, melewati batas aman 30%` },
    tenor === wantedTenor
      ? { label: "Tujuan & tenor", points: 20, max: 20, reason: `Melayani "${purpose}" dengan tenor ${tenor} bulan` }
      : { label: "Tujuan & tenor", points: 10, max: 20, reason: `Tenor ${wantedTenor} bulan tidak tersedia, disesuaikan jadi ${tenor} bulan` },
    amount <= lender.collateralFreeUpTo
      ? { label: "Agunan", points: 20, max: 20, reason: "Tanpa agunan untuk jumlah ini" }
      : { label: "Agunan", points: 10, max: 20, reason: `Perlu agunan untuk pinjaman di atas ${juta(lender.collateralFreeUpTo)}` },
    { label: "Biaya", points: lender.rate <= 0.08 ? 10 : lender.rate <= 0.15 ? 7 : 4, max: 10, reason: `Bunga ${Math.round(lender.rate * 100)}% per tahun (flat)` },
    { label: "Kecepatan", points: lender.days <= 1 ? 10 : lender.days <= 3 ? 8 : 5, max: 10, reason: `Perkiraan cair: ${lender.daysLabel.toLowerCase()}` },
  ];
  const total = factors.reduce((s, f) => s + f.points, 0);
  return { ...base, eligible: true, blocker: null, risk, score: risk ? Math.min(28, Math.round(total * 0.28)) : total, factors };
}

export const rankLenders = (amount: number, purpose: string, tenor: number, monthlyProfit: number) =>
  lenders.map((l) => scoreLender(l, amount, purpose, tenor, monthlyProfit)).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
