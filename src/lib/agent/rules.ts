import { rp } from "../financials";
import { createExecutor } from "./execute";
import { addDays, type Lang, type Metric, type Snapshot } from "./tools";
import { intentLabels, type Emit, type Intent } from "./types";

// The rule-based agent: same tools, same limits and the same approval flow as the
// model-driven agent, but intent, plan and wording come from fixed rules. It runs when no
// AI key is configured (demo mode) and as the fallback when the AI provider fails, so the
// agent always completes its task.

const L = (lang: Lang, en: string, id: string) => (lang === "en" ? en : id);

/** "2 juta", "1,5jt", "Rp450.000", "500rb", "5 million", "750k" -> rupiah. */
export function parseMoney(text: string): number | null {
  const t = text.toLowerCase();
  const num = (s: string) => Number(s.replace(",", "."));
  const unit = /(\d+(?:[.,]\d+)?)\s?(juta|jt|million|mn|m)\b/.exec(t);
  if (unit) return Math.round(num(unit[1]!) * 1e6);
  const thousand = /(\d+(?:[.,]\d+)?)\s?(ribu|rb|k|thousand)\b/.exec(t);
  if (thousand) return Math.round(num(thousand[1]!) * 1e3);
  const rupiah = /(?:rp\.?|idr)\s?(\d{1,3}(?:[.,]\d{3})+|\d+)/.exec(t);
  if (rupiah) return Number(rupiah[1]!.replace(/[.,]/g, ""));
  const plain = /\b(\d{1,3}(?:[.,]\d{3}){1,4}|\d{4,})\b/.exec(t);
  return plain ? Number(plain[1]!.replace(/[.,]/g, "")) : null;
}

const recordVerb = /\b(catat|catatkan|record|log|terjual|jual|menjual|sold|sell|beli|membeli|bought|buy|bayar|paid|pay|spent|terima|received|dapat)\b/i;
const incomeWord = /\b(terjual|jual|menjual|sold|sell|terima|received|dapat|pemasukan|income|penjualan|pesanan|order)\b/i;

export function classifyIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (recordVerb.test(t) && parseMoney(t) !== null && !/\?$/.test(t.trim())) return "record_transaction";
  if (/(modal|pinjam|kredit|\bkur\b|loan|financ|borrow|funding|capital|lender)/.test(t)) return "financing";
  if (/(biaya|hemat|boros|ongkir|pengeluaran|\bcost|expense|spend|saving|\bsave\b|cut\b|cheaper)/.test(t)) return "cost_analysis";
  if (/(\bkas\b|cash|aman|runway|minus|cukup|shortfall|saldo|tagihan|utang|hutang|debt|\bbill|afford|jatuh tempo|due)/.test(t)) return "cash_health";
  if (/(laporan|ringkas|kondisi|keadaan|overview|summary|report|performa|sehat|how.*(business|doing)|bagaimana usaha)/.test(t)) return "overview";
  return "general";
}

const plans: Record<Exclude<Intent, "forbidden">, { en: string[]; id: string[] }> = {
  cash_health: {
    en: ["Read the last 30 days", "Forecast cash for 30 days", "Check upcoming bills and debts", "If cash runs short: propose a fix and measure it"],
    id: ["Baca 30 hari terakhir", "Proyeksikan kas 30 hari", "Cek tagihan dan utang", "Jika kas kurang: usulkan solusi dan ukur dampaknya"],
  },
  cost_analysis: {
    en: ["Read the last 30 days", "Compare costs with the month before", "Show the transactions behind the biggest rise"],
    id: ["Baca 30 hari terakhir", "Bandingkan biaya dengan bulan sebelumnya", "Tunjukkan transaksi penyebab kenaikan terbesar"],
  },
  financing: {
    en: ["Read 90 days of profit", "Forecast cash", "Score the simulated lenders", "Prepare the safest application for approval"],
    id: ["Baca laba 90 hari", "Proyeksikan kas", "Nilai lembaga (simulasi)", "Siapkan pengajuan paling aman untuk disetujui"],
  },
  record_transaction: { en: ["Read amount and type from the message", "Prepare the transaction for approval"], id: ["Baca nominal dan jenis dari pesan", "Siapkan transaksi untuk disetujui"] },
  overview: { en: ["Read the last 30 days", "Forecast cash", "Look for costs that went up"], id: ["Baca 30 hari terakhir", "Proyeksikan kas", "Cari biaya yang naik"] },
  general: { en: ["Read the last 30 days", "Forecast cash"], id: ["Baca 30 hari terakhir", "Proyeksikan kas"] },
};

type Data<T> = T & Record<string, unknown>;

export function runRuleAgent(question: string, snap: Snapshot, lang: Lang, emit: Emit) {
  const intent = classifyIntent(question);
  emit({ type: "intent", intent, label: intentLabels[intent][lang] });
  if (intent === "forbidden") return;
  emit({ type: "plan", steps: plans[intent][lang] });
  const ex = createExecutor(snap, lang, emit);
  const lines: string[] = [];
  const metric = (m: Metric[] | undefined, key: Metric["key"]) => m?.find((x) => x.key === key);

  const summary = (days: number) => {
    const r = ex.call("get_summary", { days });
    return r.ok ? (r.outcome.data as Data<{ income: number; expenses: number; net_profit: number; margin_pct: number; transactions: number }>) : null;
  };
  const forecast = () => {
    const r = ex.call("forecast_cash");
    return r.ok ? { data: r.outcome.data as Data<{ current_balance: number; deficit: { day: number; shortfall: number; trigger: { id: string; label: string; amount: number; due: string } | null } | null; lowest: { balance: number } }>, metrics: r.outcome.metrics } : null;
  };
  const financing = (amount: number, purpose: string, tenor: number) => {
    const m = ex.call("match_financing", { amount, purpose, tenor_months: tenor });
    if (!m.ok) return;
    const opts = (m.outcome.data as Data<{ options: { lender: string; eligible: boolean; risk_warning: boolean; score: number; tenor: number; installment: number }[]; safe_installment_cap: number }>);
    const best = opts.options.find((o) => o.eligible && !o.risk_warning);
    if (!best) {
      lines.push(L(lang, `No simulated lender fits safely: every installment is above your safe cap of ${rp(opts.safe_installment_cap)}/month. Lower the amount or lengthen the tenor.`, `Tidak ada lembaga simulasi yang aman: semua cicilan di atas batas aman ${rp(opts.safe_installment_cap)}/bulan. Kecilkan jumlah atau perpanjang tenor.`));
      return;
    }
    lines.push(L(lang, `Best match: **${best.lender}** (score ${best.score}/100), ${rp(best.installment)}/month for ${best.tenor} months, within your safe cap of ${rp(opts.safe_installment_cap)}.`, `Paling cocok: **${best.lender}** (skor ${best.score}/100), ${rp(best.installment)}/bulan selama ${best.tenor} bulan, di bawah batas aman ${rp(opts.safe_installment_cap)}.`));
    ex.call("propose_financing_application", { lender: best.lender, amount, purpose, tenor_months: best.tenor });
  };

  if (intent === "record_transaction") {
    const amount = parseMoney(question)!;
    const type = incomeWord.test(question) ? "income" : "expense";
    const title = question.replace(/^(tolong\s+)?(catat(kan)?|record|log)\s*:?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 80) || (type === "income" ? "Pemasukan" : "Pengeluaran");
    const r = ex.call("propose_transaction", { title, amount, type });
    lines.push(r.ok ? L(lang, `I prepared this ${type} of **${rp(amount)}**. Check the category and tap **Approve** to save it.`, `Aku sudah menyiapkan ${type === "income" ? "pemasukan" : "pengeluaran"} **${rp(amount)}**. Cek kategorinya lalu tekan **Setujui** untuk menyimpan.`) : r.error);
  }

  if (intent === "cash_health" || intent === "general" || intent === "overview") {
    const s = summary(30);
    if (s) lines.push(L(lang, `Last 30 days: income **${rp(s.income)}**, expenses **${rp(s.expenses)}**, profit **${rp(s.net_profit)}** (margin ${s.margin_pct}%).`, `30 hari terakhir: pemasukan **${rp(s.income)}**, pengeluaran **${rp(s.expenses)}**, laba **${rp(s.net_profit)}** (margin ${s.margin_pct}%).`));
    const f = forecast();
    if (f) {
      const d = f.data.deficit;
      lines.push(d
        ? L(lang, `⚠️ Cash is projected to go negative on **day ${d.day}**, short by **${rp(d.shortfall)}**${d.trigger ? `, after "${d.trigger.label}" ${rp(d.trigger.amount)} is due on ${d.trigger.due}` : ""}.`, `⚠️ Kas diperkirakan minus pada **hari ke-${d.day}**, kurang **${rp(d.shortfall)}**${d.trigger ? `, setelah "${d.trigger.label}" ${rp(d.trigger.amount)} jatuh tempo ${d.trigger.due}` : ""}.`)
        : L(lang, `✅ Cash stays positive for the next 30 days (lowest ${rp(f.data.lowest.balance)}).`, `✅ Kas tetap positif 30 hari ke depan (terendah ${rp(f.data.lowest.balance)}).`));
      if (intent === "cash_health") {
        ex.call("list_obligations");
        if (d?.trigger) {
          const r = ex.call("propose_reschedule", { planned_id: d.trigger.id, new_due: addDays(d.trigger.due, 14) });
          const gained = r.ok ? metric(r.outcome.metrics, "days_gained") : undefined;
          if (gained && gained.raw > 0) lines.push(L(lang, `Option 1: ask the supplier to move "${d.trigger.label}" by 14 days, which adds **${gained.value}** of cash runway.`, `Opsi 1: minta pemasok menggeser "${d.trigger.label}" 14 hari, kas aman bertambah **${gained.value}**.`));
        }
        if (d) financing(Math.ceil(d.shortfall / 500000) * 500000, "Tambah stok", 6);
      }
    }
    if (intent === "overview") {
      const c = ex.call("detect_cost_spikes");
      if (c.ok) lines.push(c.outcome.summary + ".");
    }
  }

  if (intent === "cost_analysis") {
    summary(30);
    const c = ex.call("detect_cost_spikes");
    if (c.ok) {
      const d = c.outcome.data as Data<{ spikes: { category: string; now: number; before: number; increase_pct: number; savings: number }[]; potential_monthly_savings: number }>;
      const top = d.spikes[0];
      if (top) {
        lines.push(L(lang, `**${top.category}** rose **${top.increase_pct}%** (${rp(top.before)} → ${rp(top.now)}). Bringing costs that rose back to last month's level saves up to **${rp(d.potential_monthly_savings)}/month**.`, `**${top.category}** naik **${top.increase_pct}%** (${rp(top.before)} → ${rp(top.now)}). Mengembalikan biaya yang naik ke level bulan lalu bisa menghemat sampai **${rp(d.potential_monthly_savings)}/bulan**.`));
        const f = ex.call("find_transactions", { category: top.category, days: 30 });
        if (f.ok) lines.push(L(lang, `The ${(f.outcome.data as unknown[]).length} transactions behind it are listed as sources.`, `${(f.outcome.data as unknown[]).length} transaksi penyebabnya tercantum sebagai sumber.`));
      } else lines.push(L(lang, "No cost category rose 15% or more compared with last month. 👍", "Tidak ada biaya yang naik 15% atau lebih dibanding bulan lalu. 👍"));
    }
  }

  if (intent === "financing") {
    const s = summary(90);
    if (s) lines.push(L(lang, `Last 90 days profit: **${rp(s.net_profit)}**.`, `Laba 90 hari terakhir: **${rp(s.net_profit)}**.`));
    forecast();
    const amount = parseMoney(question) ?? 5_000_000;
    const tenor = Number(/(\d+)\s?(bulan|bln|months?|mo)\b/i.exec(question)?.[1]) || 12;
    const purpose = /(alat|equipment|machine|mesin)/i.test(question) ? "Beli alat" : /(renov)/i.test(question) ? "Renovasi toko" : "Tambah stok";
    financing(amount, purpose, tenor);
  }

  if (ex.proposals.length) lines.push(L(lang, "Nothing changes until you approve. Financing is simulated; final decisions belong to licensed (OJK) institutions.", "Tidak ada yang berubah sebelum kamu setujui. Pembiayaan bersifat simulasi; keputusan akhir ada di lembaga berizin OJK."));
  emit({ type: "answer", text: lines.join("\n\n") });
}
