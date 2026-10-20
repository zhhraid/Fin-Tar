import { z } from "zod";
import { suggestCategory } from "../csv";
import { categoryLabel, dateInputValue, expenseCategories, forecastCash, getCreditProfile, incomeCategories, openPlanned, rollingDays, rp, summarize, type Category, type Planned, type Profile, type Tx } from "../financials";
import { healthyCap, lenderName, lenders, rankLenders } from "../scoring";

// The FinTar agent's tools. Every tool has a permission tier (PRD section 8):
//   T0 read     runs automatically
//   T1 suggest  runs automatically, always returns its reasons
//   T2 act      never runs here: it returns a *proposal* that the user approves or rejects
//               in the app, which then performs it (src/components/FinixChat.tsx)
// Tier-3 requests (moving money, other people's data, sending data out) are refused before
// any tool runs (src/lib/guardrails.ts).
// Tools run on a snapshot of the user's own records sent with the request, so a tool can
// never read another account's data. Text inside records is data, never instructions.

export type Lang = "id" | "en";
export type Tier = "T0" | "T1" | "T2";
export type Snapshot = { ledger: Tx[]; profile: Profile; planned: Planned[]; now: Date };

/** A number the user can check, shown on the answer and stored in the activity log. */
export type Metric = { key: "runway_days" | "lowest_balance" | "savings_month" | "installment_share" | "days_gained" | "net_30d" | "margin_30d"; label: string; value: string; raw: number; good?: boolean };

export type Proposal =
  | { id: string; kind: "add_transaction"; title: string; why: string; tx: { title: string; amount: number; type: Tx["type"]; category: Category; date: string } }
  | { id: string; kind: "reschedule_payment"; title: string; why: string; plannedId: string; from: string; to: string; impact: Metric | null }
  | { id: string; kind: "add_reminder"; title: string; why: string; item: { kind: Planned["kind"]; label: string; amount: number; due: string } }
  | { id: string; kind: "financing_application"; title: string; why: string; application: { lender: string; amount: number; purpose: string; tenor: number; installment: number } };

export type ToolOutcome = { summary: string; data: unknown; metrics?: Metric[]; proposal?: Proposal; sources?: string[] };

type ToolDef<S extends z.ZodTypeAny> = {
  name: string;
  tier: Tier;
  title: { id: string; en: string };
  description: string;
  schema: S;
  jsonSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (snap: Snapshot, input: z.infer<S>, lang: Lang) => ToolOutcome;
};
const tool = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d;

const L = (lang: Lang, en: string, id: string) => (lang === "en" ? en : id);
const DAY = 86400000;
const addDays = (ymd: string, n: number) => dateInputValue(new Date(Date.parse(`${ymd}T12:00:00`) + n * DAY));
const MAX_AMOUNT = 10_000_000_000; // Rp10 bn: anything larger is a typo, not a transaction
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00`)), "invalid date");
const money = z.number().positive().max(MAX_AMOUNT).transform((n) => Math.round(n));
const allCategories = [...incomeCategories, ...expenseCategories] as [Category, ...Category[]];
const purposes = ["Tambah stok", "Beli alat", "Renovasi toko"] as const;
let seq = 0;
const proposalId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

const byCategory = (txs: Tx[]) => {
  const m = new Map<string, number>();
  for (const t of txs) if (t.type === "expense") m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
  return m;
};

function runway(snap: Snapshot, planned = snap.planned) {
  const f = forecastCash(snap.ledger, snap.profile, planned, 30, snap.now);
  return { f, days: f.deficit ? f.deficit.day : 31 };
}
const runwayMetric = (days: number, lang: Lang): Metric => ({ key: "runway_days", label: L(lang, "Cash runway", "Kas aman"), value: days > 30 ? L(lang, "30+ days", "30+ hari") : L(lang, `${days} days`, `${days} hari`), raw: Math.min(days, 31), good: days > 30 });

export const tools = [
  tool({
    name: "plan_task",
    tier: "T0",
    title: { en: "Understand the request and plan", id: "Pahami permintaan & susun rencana" },
    description: "Call this FIRST, once. State the user's intent and the ordered steps (tools) you will take. Intents: cash_health, cost_analysis, financing, record_transaction, overview, general.",
    schema: z.object({ intent: z.enum(["cash_health", "cost_analysis", "financing", "record_transaction", "overview", "general"]), steps: z.array(z.string().max(120)).min(1).max(6) }),
    jsonSchema: { type: "object", properties: { intent: { type: "string", enum: ["cash_health", "cost_analysis", "financing", "record_transaction", "overview", "general"] }, steps: { type: "array", items: { type: "string" }, description: "Short step descriptions, in order" } }, required: ["intent", "steps"] },
    run: (_s, input, lang) => ({ summary: L(lang, `Plan: ${input.steps.length} steps`, `Rencana: ${input.steps.length} langkah`), data: { ok: true } }),
  }),
  tool({
    name: "get_summary",
    tier: "T0",
    title: { en: "Read income & expenses", id: "Baca pemasukan & pengeluaran" },
    description: "Income, expenses, net profit, margin and expenses by category for the last N days (default 30), compared with the N days before.",
    schema: z.object({ days: z.number().int().min(1).max(365).default(30) }),
    jsonSchema: { type: "object", properties: { days: { type: "integer", description: "Window in days, 1-365. Default 30." } } },
    run: (snap, { days }, lang) => {
      const cur = rollingDays(snap.ledger, 0, days, snap.now);
      const prev = rollingDays(snap.ledger, days, days * 2, snap.now);
      const s = summarize(cur);
      const p = summarize(prev);
      const margin = s.revenue ? Math.round((s.net / s.revenue) * 1000) / 10 : 0;
      return {
        summary: L(lang, `${days} days: income ${rp(s.revenue)}, expenses ${rp(s.expense)}, profit ${rp(s.net)} (${cur.length} transactions)`, `${days} hari: pemasukan ${rp(s.revenue)}, pengeluaran ${rp(s.expense)}, laba ${rp(s.net)} (${cur.length} transaksi)`),
        data: { days, income: s.revenue, expenses: s.expense, net_profit: s.net, margin_pct: margin, transactions: cur.length, previous_period: { income: p.revenue, expenses: p.expense, net_profit: p.net }, expenses_by_category: Object.fromEntries(byCategory(cur)) },
        metrics: [
          { key: "net_30d", label: L(lang, `Profit (${days}d)`, `Laba (${days} hr)`), value: rp(s.net), raw: s.net, good: s.net >= 0 },
          { key: "margin_30d", label: L(lang, "Net margin", "Margin bersih"), value: `${margin}%`, raw: margin, good: margin >= 10 },
        ],
        sources: cur.map((t) => t.id),
      };
    },
  }),
  tool({
    name: "forecast_cash",
    tier: "T0",
    title: { en: "Forecast cash for 30 days", id: "Proyeksi kas 30 hari" },
    description: "30-day cash forecast: current balance, average daily in/out, the first day the balance goes negative (if any), the shortfall, and the obligation that triggers it.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    run: (snap, _i, lang) => {
      const { f, days } = runway(snap);
      return {
        summary: f.deficit
          ? L(lang, `Cash goes negative on day ${f.deficit.day} (short ${rp(f.deficit.shortfall)})`, `Kas minus pada hari ke-${f.deficit.day} (kurang ${rp(f.deficit.shortfall)})`)
          : L(lang, `Cash stays positive for 30 days; lowest ${rp(f.lowest.balance)}`, `Kas tetap positif 30 hari; terendah ${rp(f.lowest.balance)}`),
        data: { current_balance: f.cash, avg_daily_income: Math.round(f.dailyIn), avg_daily_expense: Math.round(f.dailyOut), obligations_due_30d: f.dueTotal, deficit: f.deficit ? { day: f.deficit.day, shortfall: f.deficit.shortfall, trigger: f.deficit.trigger ? { id: f.deficit.trigger.id, label: f.deficit.trigger.label, amount: f.deficit.trigger.amount, due: f.deficit.trigger.due } : null } : null, lowest: f.lowest },
        metrics: [runwayMetric(days, lang), { key: "lowest_balance", label: L(lang, "Lowest balance (30d)", "Saldo terendah (30 hr)"), value: rp(f.lowest.balance), raw: f.lowest.balance, good: f.lowest.balance >= 0 }],
      };
    },
  }),
  tool({
    name: "list_obligations",
    tier: "T0",
    title: { en: "List upcoming bills & debts", id: "Daftar tagihan & utang" },
    description: "Unpaid supplier debts and scheduled expenses, soonest first, with ids for rescheduling.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    run: (snap, _i, lang) => {
      const open = openPlanned(snap.planned);
      return {
        summary: open.length ? L(lang, `${open.length} unpaid: ${open.map((o) => `${o.label} ${rp(o.amount)} (${o.due})`).join(", ")}`, `${open.length} belum dibayar: ${open.map((o) => `${o.label} ${rp(o.amount)} (${o.due})`).join(", ")}`) : L(lang, "No unpaid bills", "Tidak ada tagihan"),
        data: open.map((o) => ({ id: o.id, kind: o.kind, label: o.label, amount: o.amount, due: o.due })),
      };
    },
  }),
  tool({
    name: "detect_cost_spikes",
    tier: "T1",
    title: { en: "Find costs that went up", id: "Cari biaya yang naik" },
    description: "Compares expense categories in the last 30 days with the 30 days before and returns the ones that rose 15% or more, with the monthly amount that could be saved by returning to the previous level.",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {} },
    run: (snap, _i, lang) => {
      const cur = byCategory(rollingDays(snap.ledger, 0, 30, snap.now));
      const prev = byCategory(rollingDays(snap.ledger, 30, 60, snap.now));
      const spikes = [...cur.entries()]
        .map(([category, now]) => ({ category, now, before: prev.get(category) ?? 0 }))
        .filter((s) => s.before > 0 && s.now / s.before >= 1.15 && s.now - s.before >= 20000)
        .map((s) => ({ ...s, increase_pct: Math.round((s.now / s.before - 1) * 100), savings: s.now - s.before }))
        .sort((a, b) => b.savings - a.savings);
      const savings = spikes.reduce((sum, s) => sum + s.savings, 0);
      return {
        summary: spikes.length ? L(lang, `${spikes.map((s) => `${categoryLabel(s.category, lang)} +${s.increase_pct}%`).join(", ")}; up to ${rp(savings)}/month back`, `${spikes.map((s) => `${s.category} +${s.increase_pct}%`).join(", ")}; bisa hemat sampai ${rp(savings)}/bulan`) : L(lang, "No category rose 15% or more", "Tidak ada biaya yang naik 15% atau lebih"),
        data: { spikes, potential_monthly_savings: savings, reason: "Savings = this month's amount minus the previous month's, per category that rose at least 15%." },
        metrics: [{ key: "savings_month", label: L(lang, "Potential savings", "Potensi hemat"), value: L(lang, `${rp(savings)}/mo`, `${rp(savings)}/bln`), raw: savings, good: savings > 0 }],
      };
    },
  }),
  tool({
    name: "find_transactions",
    tier: "T0",
    title: { en: "Look up transactions", id: "Cari transaksi" },
    description: "Search the user's own transactions by text and/or category within the last N days. Returns up to 10, newest first, with ids.",
    schema: z.object({ query: z.string().max(60).optional(), category: z.enum(allCategories).optional(), days: z.number().int().min(1).max(365).default(60) }),
    jsonSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string", enum: allCategories }, days: { type: "integer" } } },
    run: (snap, { query, category, days }, lang) => {
      const q = query?.toLowerCase();
      const hits = rollingDays(snap.ledger, 0, days, snap.now)
        .filter((t) => (!category || t.category === category) && (!q || t.title.toLowerCase().includes(q)))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
        .slice(0, 10);
      return {
        summary: L(lang, `${hits.length} transaction(s) found`, `${hits.length} transaksi ditemukan`),
        data: hits.map((t) => ({ id: t.id, date: t.date.slice(0, 10), title: t.title, amount: t.amount, type: t.type, category: t.category })),
        sources: hits.map((t) => t.id),
      };
    },
  }),
  tool({
    name: "match_financing",
    tier: "T1",
    title: { en: "Match financing options", id: "Cocokkan opsi pembiayaan" },
    description: "Scores the simulated lenders (0-100) for an amount, purpose and tenor against the user's repayment capacity (installment must stay under 30% of average monthly profit). Simulated data, not real offers.",
    schema: z.object({ amount: money, purpose: z.enum(purposes).default("Tambah stok"), tenor_months: z.number().int().min(1).max(36).default(12) }),
    jsonSchema: { type: "object", properties: { amount: { type: "number", description: "Rupiah" }, purpose: { type: "string", enum: [...purposes] }, tenor_months: { type: "integer" } }, required: ["amount"] },
    run: (snap, { amount, purpose, tenor_months }, lang) => {
      const profit = getCreditProfile(snap.ledger).monthlyProfit;
      const ranked = rankLenders(amount, purpose, tenor_months, profit, lang).slice(0, 3);
      const best = ranked.find((m) => m.eligible && !m.risk);
      const cap = healthyCap(profit);
      return {
        summary: best ? L(lang, `Best: ${lenderName(best.lender.name, lang)}, score ${best.score}, ${rp(best.installment)}/mo`, `Terbaik: ${best.lender.name}, skor ${best.score}, ${rp(best.installment)}/bln`) : L(lang, "No option fits safely", "Tidak ada opsi yang aman"),
        data: { simulated: true, avg_monthly_profit: Math.round(profit), safe_installment_cap: cap, options: ranked.map((m) => ({ lender: m.lender.name, eligible: m.eligible, blocker: m.blocker, score: m.score, tenor: m.tenor, installment: m.installment, risk_warning: m.risk, reasons: m.factors.map((f) => `${f.label}: ${f.reason}`) })) },
        metrics: best ? [{ key: "installment_share", label: L(lang, "Installment / profit", "Cicilan / laba"), value: profit > 0 ? `${Math.round((best.installment / profit) * 100)}%` : "-", raw: profit > 0 ? best.installment / profit : 1, good: best.installment <= cap }] : [],
      };
    },
  }),
  tool({
    name: "propose_transaction",
    tier: "T2",
    title: { en: "Propose recording a transaction", id: "Usulkan catat transaksi" },
    description: "Prepare a transaction for the user to approve. It is NOT saved until the user taps Approve. Use only when the user asks to record something.",
    schema: z.object({ title: z.string().min(1).max(80), amount: money, type: z.enum(["income", "expense"]), category: z.enum(allCategories).optional(), date: ymd.optional() }),
    jsonSchema: { type: "object", properties: { title: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["income", "expense"] }, category: { type: "string", enum: allCategories }, date: { type: "string", description: "YYYY-MM-DD, default today" } }, required: ["title", "amount", "type"] },
    run: (snap, input, lang) => {
      const today = dateInputValue(snap.now);
      const date = input.date && input.date <= today ? input.date : today;
      const fits = input.category && (input.type === "income" ? incomeCategories : expenseCategories).includes(input.category);
      const category = (fits ? input.category : null) ?? suggestCategory(input.title, input.type) ?? (input.type === "income" ? "Penjualan" : "Lainnya");
      const proposal: Proposal = { id: proposalId(), kind: "add_transaction", title: L(lang, `Record ${input.type}: ${input.title} ${rp(input.amount)}`, `Catat ${input.type === "income" ? "pemasukan" : "pengeluaran"}: ${input.title} ${rp(input.amount)}`), why: L(lang, `Category ${categoryLabel(category, lang)}, dated ${date}.`, `Kategori ${category}, tanggal ${date}.`), tx: { title: input.title, amount: input.amount, type: input.type, category, date } };
      return { summary: L(lang, "Waiting for your approval", "Menunggu persetujuanmu"), data: { status: "pending_user_approval", proposal_id: proposal.id }, proposal };
    },
  }),
  tool({
    name: "propose_reschedule",
    tier: "T2",
    title: { en: "Propose moving a payment date", id: "Usulkan geser jadwal bayar" },
    description: "Prepare moving an unpaid bill or debt (by id from list_obligations) to a later date, with the cash-runway effect measured by re-running the forecast. The user must negotiate the new date with the supplier; nothing changes until they approve.",
    schema: z.object({ planned_id: z.string().min(1).max(80), new_due: ymd }),
    jsonSchema: { type: "object", properties: { planned_id: { type: "string" }, new_due: { type: "string", description: "YYYY-MM-DD" } }, required: ["planned_id", "new_due"] },
    run: (snap, { planned_id, new_due }, lang) => {
      const item = openPlanned(snap.planned).find((p) => p.id === planned_id);
      if (!item) throw new ToolError(L(lang, "Unknown or already paid obligation id", "Id tagihan tidak dikenal atau sudah lunas"));
      if (new_due <= item.due) throw new ToolError(L(lang, "The new date must be later than the current one", "Tanggal baru harus setelah tanggal sekarang"));
      const before = runway(snap).days;
      const after = runway(snap, snap.planned.map((p) => (p.id === item.id ? { ...p, due: new_due } : p))).days;
      const gained = Math.min(after, 31) - Math.min(before, 31);
      const impact: Metric = { key: "days_gained", label: L(lang, "Runway gained", "Kas aman bertambah"), value: L(lang, `+${gained} days`, `+${gained} hari`), raw: gained, good: gained > 0 };
      const proposal: Proposal = { id: proposalId(), kind: "reschedule_payment", title: L(lang, `Move "${item.label}" ${rp(item.amount)} from ${item.due} to ${new_due}`, `Geser "${item.label}" ${rp(item.amount)} dari ${item.due} ke ${new_due}`), why: L(lang, `Forecast: cash runway ${before > 30 ? "30+" : before} → ${after > 30 ? "30+" : after} days. Agree the new date with the supplier first.`, `Proyeksi: kas aman ${before > 30 ? "30+" : before} → ${after > 30 ? "30+" : after} hari. Sepakati tanggal baru dengan pemasok dulu.`), plannedId: item.id, from: item.due, to: new_due, impact };
      return { summary: L(lang, `Waiting for approval (${impact.value})`, `Menunggu persetujuan (${impact.value})`), data: { status: "pending_user_approval", runway_before_days: before, runway_after_days: after }, metrics: [impact], proposal };
    },
  }),
  tool({
    name: "propose_reminder",
    tier: "T2",
    title: { en: "Propose a bill reminder", id: "Usulkan pengingat tagihan" },
    description: "Prepare adding an upcoming supplier debt or scheduled expense so the forecast includes it. Not saved until the user approves.",
    schema: z.object({ kind: z.enum(["debt", "expense"]), label: z.string().min(1).max(60), amount: money, due: ymd }),
    jsonSchema: { type: "object", properties: { kind: { type: "string", enum: ["debt", "expense"] }, label: { type: "string" }, amount: { type: "number" }, due: { type: "string", description: "YYYY-MM-DD" } }, required: ["kind", "label", "amount", "due"] },
    run: (_snap, input, lang) => {
      const proposal: Proposal = { id: proposalId(), kind: "add_reminder", title: L(lang, `Add ${input.kind === "debt" ? "debt" : "scheduled expense"}: ${input.label} ${rp(input.amount)} due ${input.due}`, `Tambah ${input.kind === "debt" ? "utang" : "belanja terjadwal"}: ${input.label} ${rp(input.amount)} jatuh tempo ${input.due}`), why: L(lang, "It will be included in the 30-day cash forecast and alerts.", "Akan masuk ke proyeksi kas 30 hari dan peringatan."), item: input };
      return { summary: L(lang, "Waiting for your approval", "Menunggu persetujuanmu"), data: { status: "pending_user_approval", proposal_id: proposal.id }, proposal };
    },
  }),
  tool({
    name: "propose_financing_application",
    tier: "T2",
    title: { en: "Propose a financing application", id: "Usulkan pengajuan pembiayaan" },
    description: "Prepare an application to a SIMULATED lender (sandbox; no real submission). Only for an option match_financing found eligible without a risk warning. Requires user approval and PIN.",
    schema: z.object({ lender: z.string().min(1).max(60), amount: money, purpose: z.enum(purposes).default("Tambah stok"), tenor_months: z.number().int().min(1).max(36) }),
    jsonSchema: { type: "object", properties: { lender: { type: "string" }, amount: { type: "number" }, purpose: { type: "string", enum: [...purposes] }, tenor_months: { type: "integer" } }, required: ["lender", "amount", "tenor_months"] },
    run: (snap, { lender, amount, purpose, tenor_months }, lang) => {
      if (!lenders.some((l) => l.name === lender)) throw new ToolError(L(lang, "Unknown lender; call match_financing first", "Lembaga tidak dikenal; jalankan match_financing dulu"));
      const match = rankLenders(amount, purpose, tenor_months, getCreditProfile(snap.ledger).monthlyProfit, lang).find((m) => m.lender.name === lender)!;
      // Safe execution: the agent cannot propose an option that fails the affordability rule.
      if (!match.eligible || match.risk) throw new ToolError(L(lang, `Blocked: ${match.blocker ?? "installment above 30% of monthly profit"}`, `Diblokir: ${match.blocker ?? "cicilan di atas 30% laba bulanan"}`));
      const proposal: Proposal = { id: proposalId(), kind: "financing_application", title: L(lang, `Apply to ${lenderName(lender, lang)} (simulated): ${rp(amount)}, ${match.tenor} months`, `Ajukan ke ${lender} (simulasi): ${rp(amount)}, ${match.tenor} bulan`), why: L(lang, `Score ${match.score}/100, installment ${rp(match.installment)}/month. Sandbox only; real decisions belong to licensed lenders.`, `Skor ${match.score}/100, cicilan ${rp(match.installment)}/bulan. Hanya simulasi; keputusan nyata ada di lembaga berizin.`), application: { lender, amount, purpose, tenor: match.tenor, installment: match.installment } };
      return { summary: L(lang, "Waiting for approval + PIN", "Menunggu persetujuan + PIN"), data: { status: "pending_user_approval", proposal_id: proposal.id, score: match.score }, proposal };
    },
  }),
];

export type ToolName = (typeof tools)[number]["name"];
export class ToolError extends Error {}
export const toolByName = (name: string) => tools.find((t) => t.name === name);

/** Validates the input against the tool's schema, then runs it. Never throws. */
export function runTool(name: string, rawInput: unknown, snap: Snapshot, lang: Lang): { ok: true; tier: Tier; outcome: ToolOutcome } | { ok: false; tier: Tier | "T3"; error: string } {
  const def = toolByName(name);
  if (!def) return { ok: false, tier: "T3", error: L(lang, `Unknown tool "${name}" refused`, `Alat "${name}" tidak dikenal, ditolak`) };
  const parsed = def.schema.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, tier: def.tier, error: L(lang, `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, `Input tidak valid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`) };
  try {
    return { ok: true, tier: def.tier, outcome: (def.run as (s: Snapshot, i: unknown, l: Lang) => ToolOutcome)(snap, parsed.data, lang) };
  } catch (e) {
    return { ok: false, tier: def.tier, error: e instanceof ToolError ? e.message : L(lang, "Tool failed", "Alat gagal") };
  }
}

export const toolSpecs = () => tools.map((t) => ({ name: t.name, description: `[${t.tier}] ${t.description}`, input_schema: t.jsonSchema }));
export const toolTitle = (name: string, lang: Lang) => toolByName(name)?.title[lang] ?? name;
export const toolTier = (name: string): Tier | "T3" => toolByName(name)?.tier ?? "T3";
export { addDays };
