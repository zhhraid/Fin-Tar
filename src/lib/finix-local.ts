import { cashBalance, forecastCash, getCreditProfile, getInsights, rollingDays, rp, summarize, type Planned, type Profile, type Tx } from "./financials";

// Rule-based answers for demo mode (no AI key). Every number comes from the ledger.

const byCategory = (txs: Tx[], type: Tx["type"]) => {
  const m = new Map<string, number>();
  txs.filter((t) => t.type === type).forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + t.amount));
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

function targetPlan(pct: number, cur: ReturnType<typeof summarize>, curTx: Tx[]) {
  if (!cur.revenue) return "Belum ada pemasukan dalam 30 hari terakhir, jadi aku belum bisa menghitung target. Catat penjualanmu dulu, ya.";
  const target = cur.revenue * (1 + pct / 100);
  const extra = target - cur.revenue;
  const sales = curTx.filter((t) => t.type === "income");
  const avgSale = cur.revenue / Math.max(1, sales.length);
  const top = byCategory(curTx, "expense")[0];
  const cogsRatio = cur.cogs / cur.revenue;
  return `**Target naik ${pct}%**

- Omzet 30 hari terakhir: **${rp(cur.revenue)}**
- Target 30 hari ke depan: **${rp(target)}** (tambah ${rp(extra)})
- Artinya perlu rata-rata **${rp(target / 30)}/hari**, naik ${rp(extra / 30)}/hari dari sekarang

**Langkah yang bisa dicoba**

1. **Tambah frekuensi jualan.** Rata-rata satu catatan penjualanmu ${rp(avgSale)}; kira-kira ${Math.max(1, Math.ceil(extra / avgSale))} penjualan tambahan sebesar itu sudah menutup selisihnya.
2. **Naikkan nilai per pembeli.** Buat paket hemat atau bonus untuk pembelian di atas jumlah tertentu.
3. **Siapkan bahan lebih awal.** Bahan baku memakan ${Math.round(cogsRatio * 100)}% dari penjualan, jadi siapkan sekitar **${rp(extra * cogsRatio)}** untuk stok tambahan.${top ? `\n4. **Jaga biaya terbesar.** ${top.label} ${rp(top.value)} adalah pengeluaran terbesarmu; pastikan tidak ikut naik lebih cepat dari omzet.` : ""}

Kalau stok tambahan terasa berat untuk kas, cek menu **Ajukan Modal**.`;
}

export function localFinixReply(question: string, all: Tx[], p: Profile, planned: Planned[] = []): string {
  const q = question.toLowerCase();
  const curTx = rollingDays(all, 0, 30);
  const prevTx = rollingDays(all, 30, 60);
  const cur = summarize(curTx);
  const prev = summarize(prevTx);
  const cash = cashBalance(all, p);
  const insights = getInsights(all, p, planned);
  const forecast = forecastCash(all, p, planned);

  if (!all.length) return "Belum ada transaksi yang tercatat. Mulai dari tombol **Pemasukan** atau **Pengeluaran** di Beranda, atau pindai struk belanjamu, lalu tanya aku lagi.";

  const pct = Number(/(\d{1,3})\s*%/.exec(q)?.[1] ?? /(\d{1,3})\s*persen/.exec(q)?.[1]);
  if (/target|naik|tumbuh|tingkat/.test(q) && pct > 0) return targetPlan(Math.min(pct, 300), cur, curTx);
  if (/target/.test(q)) return targetPlan(p.target?.pct ?? 20, cur, curTx);

  if (/hemat|biaya|pengeluaran|boros|potong/.test(q)) {
    const before = new Map(byCategory(prevTx, "expense").map((c) => [c.label, c.value]));
    const rows = byCategory(curTx, "expense");
    if (!rows.length) return "Belum ada pengeluaran yang tercatat dalam 30 hari terakhir.";
    const lines = rows.map((c) => {
      const b = before.get(c.label);
      const ch = b ? Math.round(((c.value - b) / b) * 100) : null;
      return `- **${c.label}**: ${rp(c.value)} (${Math.round((c.value / cur.expense) * 100)}% pengeluaran${ch === null ? "" : ch === 0 ? ", tetap" : `, ${ch > 0 ? "naik" : "turun"} ${Math.abs(ch)}%`})`;
    });
    const worst = rows.map((c) => ({ ...c, b: before.get(c.label) ?? 0 })).filter((c) => c.b > 0).sort((a, b) => b.value / b.b - a.value / a.b)[0];
    return `**Pengeluaran 30 hari terakhir: ${rp(cur.expense)}**

${lines.join("\n")}

${worst && worst.value > worst.b ? `Yang paling perlu dicek: **${worst.label}**, naik dari ${rp(worst.b)} ke ${rp(worst.value)}. ` : ""}Mulai dari pos terbesar: menawar harga pemasok atau membeli dalam jumlah lebih besar biasanya paling terasa hasilnya.`;
  }

  if (/modal|pinjam|kredit|utang|hutang|cicil/.test(q)) {
    const c = getCreditProfile(all);
    if (c.monthlyProfit <= 0) return `Rata-rata labamu saat ini ${rp(c.monthlyProfit)}/bulan, jadi mengambil cicilan belum aman. Perbaiki arus kas dulu; aku bisa bantu cari biaya yang bisa ditekan.`;
    return `**Kesiapan mengajukan modal**

- Laba rata-rata: **${rp(c.monthlyProfit)}/bulan**
- Cicilan yang masih sehat (maks. 30% laba): **${rp(c.monthlyProfit * 0.3)}/bulan**
- Catatan keuangan: ${c.txCount} transaksi selama ${c.recordedDays} hari

Dengan cicilan sebesar itu selama 12 bulan, pinjaman sekitar **${rp(c.monthlyProfit * 0.3 * 12 * 0.9)}** masih wajar. Buka **Ajukan Modal** di Beranda untuk membandingkan lembaga dan mengirim proposal yang terisi otomatis dari laporanmu.`;
  }

  const margin = cur.revenue ? Math.round((cur.net / cur.revenue) * 100) : 0;
  const trend = prev.revenue ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100) : null;
  const verdict = cur.net < 0 ? "sedang rugi" : margin < 10 ? "untung, tapi tipis" : "sehat";
  const summary = `**Kondisi ${p.name}: ${verdict}**

- Saldo kas: **${rp(cash)}**
- Proyeksi 30 hari: ${forecast.deficit ? `**minus pada hari ke-${forecast.deficit.day}** (kurang ${rp(forecast.deficit.shortfall)})` : `aman, saldo terendah ${rp(forecast.lowest.balance)}`}
- Pemasukan 30 hari: ${rp(cur.revenue)}${trend === null ? "" : ` (${trend >= 0 ? "naik" : "turun"} ${Math.abs(trend)}% dari periode sebelumnya)`}
- Pengeluaran 30 hari: ${rp(cur.expense)}
- Laba bersih: **${rp(cur.net)}** (margin ${margin}%)

**Yang perlu diperhatikan**

${insights.slice(0, 3).map((i) => `- ${i.title}. ${i.text}`).join("\n")}`;

  if (/kondisi|sehat|keuangan|laporan|untung|rugi|laba|kas|saldo|gimana|bagaimana/.test(q)) return summary;
  return `${summary}

Aku bisa bantu lebih jauh soal **target omzet** (contoh: "mau naik 20%"), **biaya yang bisa dihemat**, atau **kesiapan mengajukan modal**.`;
}
