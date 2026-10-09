import { useSyncExternalStore } from "react";
import { cloudEnabled } from "./env";

export const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

const DAY = 86400000;
const uuid = () => crypto.randomUUID();

/* ---------- Date helpers for <input type="date"> ---------- */
export const dateInputValue = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Today keeps the current time so new entries sort first; other days are stored at noon. */
export const dateInputToIso = (v: string) => (!v || v === dateInputValue() ? new Date().toISOString() : new Date(`${v}T12:00:00`).toISOString());
const dayOffset = (n: number, now = new Date()) => dateInputValue(new Date(now.getTime() + n * DAY));

/* ---------- Stores ---------- */
// Device mode: every store is saved in localStorage.
// Cloud mode (Supabase configured): stores are an in-memory copy of the account's rows,
// filled after sign-in by hydrateStores() and written back through the Remote adapter.
function createStore<T>(key: string, initial: T, revive: (raw: unknown) => T, cloudInitial: T = initial) {
  const start = cloudEnabled ? cloudInitial : initial;
  let state = start;
  let loaded = cloudEnabled;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) state = revive(JSON.parse(raw));
    } catch {
      /* keep initial */
    }
  };
  return {
    get: () => (load(), state),
    set: (next: T) => {
      load();
      state = next;
      if (!cloudEnabled) {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable: keep in memory */
        }
      }
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => (load(), state),
        () => start,
      ),
  };
}

/* ---------- Remote adapter (set by cloud.ts after sign-in) ---------- */
export type Remote = {
  upsertTxs(txs: Tx[]): Promise<void>;
  deleteTx(id: string): Promise<void>;
  replaceData(txs: Tx[], planned: Planned[]): Promise<void>;
  saveProfile(p: Profile): Promise<void>;
  upsertPlanned(p: Planned): Promise<void>;
  deletePlanned(p: Planned): Promise<void>;
  setConsent(granted: boolean): Promise<void>;
  logActivity(a: Activity): Promise<void>;
  saveLoan(a: LoanApplication | null): Promise<void>;
};
let remote: Remote | null = null;
let onRemoteError: (e: unknown) => void = () => {};
export function setRemote(r: Remote | null, onError?: (e: unknown) => void) {
  remote = r;
  if (onError) onRemoteError = onError;
}
const push = (fn: (r: Remote) => Promise<void>) => {
  if (remote) fn(remote).catch(onRemoteError);
};

/* ---------- Ledger ---------- */
export type Category = "Penjualan" | "Pemasukan lain" | "Bahan baku" | "Pengiriman" | "Listrik & gas" | "Upah karyawan" | "Lainnya";
export const incomeCategories: Category[] = ["Penjualan", "Pemasukan lain"];
export const expenseCategories: Category[] = ["Bahan baku", "Pengiriman", "Listrik & gas", "Upah karyawan", "Lainnya"];
const COGS: Category[] = ["Bahan baku"];

export type Tx = { id: string; title: string; amount: number; type: "income" | "expense"; category: Category; date: string; source?: "manual" | "scan" | "csv" };

function buildSeed(freshIds = false): Tx[] {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const t = now.getTime();
  const rows: [number, string, number, Tx["type"], Category][] = [];
  // three months of history, newest first offsets in days
  for (let m = 0; m < 3; m++) {
    const o = m * 30;
    const k = m === 0 ? 1 : m === 1 ? 0.92 : 0.85;
    const ship = m === 0 ? 1.3 : k;
    rows.push(
      [o + 1, "Penjualan roti harian", 890000 * k, "income", "Penjualan"],
      [o + 8, "Penjualan roti mingguan", 760000 * k, "income", "Penjualan"],
      [o + 15, "Pesanan katering", 657000 * k, "income", "Penjualan"],
      [o + 22, "Penjualan roti harian", 600000 * k, "income", "Penjualan"],
      [o + 0, "Restok bahan baku", 245000 * k, "expense", "Bahan baku"],
      [o + 12, "Tepung & telur", 875000 * k, "expense", "Bahan baku"],
      [o + 2, "Biaya pengiriman", 85000 * ship, "expense", "Pengiriman"],
      [o + 18, "Kurir pesanan", 200000 * ship, "expense", "Pengiriman"],
      [o + 10, "Listrik & gas", 252000 * k, "expense", "Listrik & gas"],
      [o + 20, "Upah paruh waktu", 150000 * k, "expense", "Upah karyawan"],
    );
  }
  return rows.map(([d, title, amount, type, category], i) => ({
    id: freshIds ? uuid() : `seed-${i}`,
    title,
    amount: Math.round(amount / 1000) * 1000,
    type,
    category,
    date: new Date(t - d * DAY).toISOString(),
  }));
}

const allCategories = [...incomeCategories, ...expenseCategories];

/** Keeps only well-formed transactions; used for stored data and for request bodies. */
export function parseLedger(raw: unknown): Tx[] {
  if (!Array.isArray(raw)) return [];
  const out: Tx[] = [];
  for (const r of raw.slice(0, 5000)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const amount = Number(x["amount"]);
    const type = x["type"];
    const date = typeof x["date"] === "string" && !Number.isNaN(Date.parse(x["date"])) ? x["date"] : null;
    if (!(amount > 0) || (type !== "income" && type !== "expense") || !date) continue;
    const category = allCategories.find((c) => c === x["category"]) ?? (type === "income" ? "Pemasukan lain" : "Lainnya");
    out.push({
      id: String(x["id"] ?? out.length),
      title: String(x["title"] ?? category).slice(0, 80),
      amount: Math.round(amount),
      type,
      category,
      date,
      ...(x["source"] === "scan" || x["source"] === "manual" || x["source"] === "csv" ? { source: x["source"] } : {}),
    });
  }
  return out;
}

const ledger = createStore<Tx[]>("fintar-ledger-v1", buildSeed(), parseLedger, []);

export function addTransaction(tx: Omit<Tx, "id" | "date"> & { date?: string }) {
  const row: Tx = { ...tx, id: uuid(), date: tx.date ?? new Date().toISOString() };
  ledger.set([row, ...ledger.get()]);
  push((r) => r.upsertTxs([row]));
  return row;
}
export function addTransactions(txs: Omit<Tx, "id">[]) {
  const rows = txs.map((t) => ({ ...t, id: uuid() }));
  ledger.set([...rows, ...ledger.get()]);
  push((r) => r.upsertTxs(rows));
  return rows.length;
}
export function updateTransaction(id: string, patch: Partial<Omit<Tx, "id">>) {
  const next = ledger.get().map((t) => (t.id === id ? { ...t, ...patch } : t));
  ledger.set(next);
  const row = next.find((t) => t.id === id);
  if (row) push((r) => r.upsertTxs([row]));
}
export function removeTransaction(id: string) {
  ledger.set(ledger.get().filter((t) => t.id !== id));
  push((r) => r.deleteTx(id));
}
/** Replaces all transactions and upcoming obligations with the example data set. */
export function resetLedger() {
  const txs = buildSeed(cloudEnabled);
  const items = buildPlannedSeed();
  ledger.set(txs);
  planned.set(items);
  push((r) => r.replaceData(txs, items));
}
export const useLedger = ledger.use;

/* ---------- Business profile ---------- */
// Opening balances are example values the owner can edit in Profil.
export type Profile = {
  name: string;
  category: string;
  openingCash: number;
  inventory: number;
  equipment: number;
  target: { pct: number; amount: number } | null;
};
export const defaultProfile: Profile = { name: "Viera Bakery", category: "Makanan", openingCash: 0, inventory: 650000, equipment: 4500000, target: null };

export function parseProfile(raw: unknown): Profile {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: "openingCash" | "inventory" | "equipment") => {
    const n = Number(x[k]);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : defaultProfile[k];
  };
  const str = (k: "name" | "category") => (typeof x[k] === "string" && x[k].trim() ? x[k].trim().slice(0, 40) : defaultProfile[k]);
  const t = x["target"] as { pct?: unknown; amount?: unknown } | null | undefined;
  const pct = Number(t?.pct);
  const amount = Number(t?.amount);
  return {
    name: str("name"),
    category: str("category"),
    openingCash: num("openingCash"),
    inventory: num("inventory"),
    equipment: num("equipment"),
    target: pct > 0 && amount > 0 ? { pct, amount: Math.round(amount) } : null,
  };
}

export const blankProfile: Profile = { name: "Usahaku", category: "Lainnya", openingCash: 0, inventory: 0, equipment: 0, target: null };
const profile = createStore<Profile>("fintar-profile-v1", defaultProfile, parseProfile, blankProfile);
export const useProfile = profile.use;
export function updateProfile(patch: Partial<Profile>) {
  const next = { ...profile.get(), ...patch };
  profile.set(next);
  push((r) => r.saveProfile(next));
}

/* ---------- Upcoming obligations: supplier debts and scheduled spending ---------- */
export type Planned = { id: string; kind: "debt" | "expense"; label: string; amount: number; /** YYYY-MM-DD */ due: string; done: boolean };

function buildPlannedSeed(): Planned[] {
  return [
    { id: uuid(), kind: "debt", label: "Utang tepung ke pemasok", amount: 750000, due: dayOffset(5), done: false },
    { id: uuid(), kind: "expense", label: "Restok bahan pesanan besar", amount: 3500000, due: dayOffset(9), done: false },
  ];
}
export function parsePlanned(raw: unknown): Planned[] {
  if (!Array.isArray(raw)) return [];
  const out: Planned[] = [];
  for (const r of raw.slice(0, 500)) {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const amount = Number(x["amount"]);
    const due = String(x["due"] ?? "");
    if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    out.push({ id: String(x["id"] ?? out.length), kind: x["kind"] === "debt" ? "debt" : "expense", label: String(x["label"] ?? "").slice(0, 80) || "Tanpa nama", amount: Math.round(amount), due, done: x["done"] === true });
  }
  return out;
}
// Fixed ids keep the server-rendered list identical to the first client render.
const plannedSeed: Planned[] = buildPlannedSeed().map((p, i) => ({ ...p, id: `seed-plan-${i}` }));
const planned = createStore<Planned[]>("fintar-planned-v1", plannedSeed, parsePlanned, []);
export const usePlanned = planned.use;
export function addPlanned(p: Omit<Planned, "id" | "done">) {
  const row: Planned = { ...p, id: uuid(), done: false };
  planned.set([...planned.get(), row]);
  push((r) => r.upsertPlanned(row));
}
export function removePlanned(id: string) {
  const row = planned.get().find((p) => p.id === id);
  planned.set(planned.get().filter((p) => p.id !== id));
  if (row) push((r) => r.deletePlanned(row));
}
/** Marks an obligation as paid and records the payment as an expense. */
export function settlePlanned(id: string) {
  const row = planned.get().find((p) => p.id === id);
  if (!row || row.done) return;
  const next = { ...row, done: true };
  planned.set(planned.get().map((p) => (p.id === id ? next : p)));
  push((r) => r.upsertPlanned(next));
  addTransaction({ title: row.kind === "debt" ? `Bayar ${row.label}` : row.label, amount: row.amount, type: "expense", category: "Bahan baku", source: "manual" });
}
export const openPlanned = (items: Planned[]) => items.filter((p) => !p.done).sort((a, b) => a.due.localeCompare(b.due));
export const payableTotal = (items: Planned[]) => items.filter((p) => p.kind === "debt" && !p.done).reduce((s, p) => s + p.amount, 0);

/* ---------- Activity log: every AI-assisted action, newest first ---------- */
// T0 membaca data, T1 memberi saran, T2 bertindak setelah disetujui pengguna, T3 dilarang.
export type Activity = { id: string; at: string; tool: string; tier: "T0" | "T1" | "T2" | "T3"; status: "completed" | "approved" | "rejected" | "blocked"; summary: string; detail?: Record<string, unknown> };
const tiers = ["T0", "T1", "T2", "T3"] as const;
const statuses = ["completed", "approved", "rejected", "blocked"] as const;
export function parseActivity(raw: unknown): Activity[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 500).flatMap((r) => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    if (typeof x["tool"] !== "string" || typeof x["at"] !== "string") return [];
    return [{
      id: String(x["id"]),
      at: x["at"],
      tool: x["tool"],
      tier: tiers.find((t) => t === x["tier"]) ?? "T0",
      status: statuses.find((t) => t === x["status"]) ?? "completed",
      summary: String(x["summary"] ?? ""),
      ...(x["detail"] && typeof x["detail"] === "object" ? { detail: x["detail"] as Record<string, unknown> } : {}),
    }];
  });
}
const activity = createStore<Activity[]>("fintar-activity-v1", [], parseActivity);
export const useActivity = activity.use;
export function logActivity(a: Omit<Activity, "id" | "at">) {
  const row: Activity = { ...a, id: uuid(), at: new Date().toISOString() };
  activity.set([row, ...activity.get()].slice(0, 500));
  push((r) => r.logActivity(row));
}

/* ---------- Consent for AI processing ---------- */
const consent = createStore<boolean>("fintar-consent-ai-v1", false, (raw) => raw === true);
export const useAiConsent = consent.use;
export function setAiConsent(granted: boolean) {
  consent.set(granted);
  push((r) => r.setConsent(granted));
  logActivity({ tool: "update_consent", tier: "T0", status: "completed", summary: granted ? "Izin pemrosesan AI diberikan" : "Izin pemrosesan AI dicabut" });
}

/* ---------- Loan application (simulated: nothing is sent to a real lender) ---------- */
export type LoanApplication = { id: string; lender: string; amount: number; purpose: string; tenor: number; installment: number; submittedAt: number };
export function parseLoan(raw: unknown): LoanApplication | null {
  const x = raw as Partial<LoanApplication> | null;
  return x && typeof x.lender === "string" && Number(x.amount) > 0 && Number(x.submittedAt) > 0 ? { ...(x as LoanApplication), id: String(x.id ?? uuid()) } : null;
}
const loan = createStore<LoanApplication | null>("fintar-loan-v1", null, parseLoan);
export const useLoanApplication = loan.use;
export function submitLoan(a: Omit<LoanApplication, "id" | "submittedAt">) {
  const row = { ...a, id: uuid(), submittedAt: Date.now() };
  loan.set(row);
  push((r) => r.saveLoan(row));
  logActivity({ tool: "submit_proposal_sandbox", tier: "T2", status: "approved", summary: `Proposal ${rp(a.amount)} dikirim ke ${a.lender} (simulasi)`, detail: { ...a } });
}
export function clearLoan() {
  loan.set(null);
  push((r) => r.saveLoan(null));
}
export const loanStages = ["Proposal terkirim", "Laporan keuangan diverifikasi", "Pengajuan disetujui"] as const;
/** Index of the stage reached; the simulation advances on a timer after submitting. */
export const loanStage = (a: LoanApplication, now = Date.now()) => (now - a.submittedAt < 8000 ? 0 : now - a.submittedAt < 20000 ? 1 : 2);

/* ---------- Bulk store access for cloud sync ---------- */
export type StoreSnapshot = { ledger: Tx[]; profile: Profile; planned: Planned[]; consent: boolean; activity: Activity[]; loan: LoanApplication | null };
/** Fills every store from the signed-in account without writing anything back. */
export function hydrateStores(s: StoreSnapshot) {
  ledger.set(s.ledger);
  profile.set(s.profile);
  planned.set(s.planned);
  consent.set(s.consent);
  activity.set(s.activity);
  loan.set(s.loan);
}
/** Empties every store (sign-out, or after the user deletes their data). */
export function clearStores() {
  hydrateStores({ ledger: [], profile: cloudEnabled ? blankProfile : defaultProfile, planned: [], consent: false, activity: [], loan: null });
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
  if (key === "quarter") { start.setDate(1); start.setMonth(start.getMonth() - 2); }
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

/** Transactions from `from` (inclusive) to `to` (exclusive) days back, counted from the end of today. */
export function rollingDays(txs: Tx[], from: number, to: number, now = new Date()) {
  const anchor = new Date(now);
  anchor.setHours(23, 59, 59, 999);
  const a = anchor.getTime();
  return txs.filter((t) => { const d = Date.parse(t.date); return d <= a - from * DAY && d > a - to * DAY; });
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

export const cashBalance = (all: Tx[], p: Profile) => p.openingCash + summarize(all).net;

export function getStatements(all: Tx[], key: PeriodKey, p: Profile = defaultProfile, items: Planned[] = []) {
  const txs = filterPeriod(all, key);
  const totals = summarize(txs);
  const allNet = summarize(all).net;
  const cash = p.openingCash + allNet;
  const payable = payableTotal(items);
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
  // Owner capital is derived from the opening balances, so the sheet always balances.
  const balanceSheet = {
    assets: [
      { label: "Kas", value: cash },
      { label: "Persediaan bahan", value: p.inventory },
      { label: "Peralatan usaha", value: p.equipment },
    ],
    liabilities: [{ label: "Utang ke pemasok", value: payable }],
    equity: [
      { label: "Modal pemilik", value: p.openingCash + p.inventory + p.equipment - payable },
      { label: "Laba ditahan", value: allNet - totals.net },
      { label: "Laba periode berjalan", value: totals.net },
    ],
  };
  return { txs, incomeStatement, totals, cashFlow, balanceSheet, cash };
}

/* ---------- 30-day cash forecast ---------- */
// Balance on day t = cash + (average daily income - average daily expense) * t
//                    - every unpaid obligation due up to day t. Averages use the last 30 days.
export function forecastCash(all: Tx[], p: Profile, items: Planned[], days = 30, now = new Date()) {
  const cash = cashBalance(all, p);
  const cur = summarize(rollingDays(all, 0, 30, now));
  const dailyIn = cur.revenue / 30;
  const dailyOut = cur.expense / 30;
  const open = openPlanned(items);
  let deficit: { day: number; shortfall: number; trigger: Planned | null } | null = null;
  let lowest = { day: 0, balance: cash };
  for (let t = 1; t <= days; t++) {
    const date = dayOffset(t, now);
    const due = open.filter((o) => o.due <= date);
    const balance = Math.round(cash + (dailyIn - dailyOut) * t - due.reduce((s, o) => s + o.amount, 0));
    if (balance < lowest.balance) lowest = { day: t, balance };
    if (balance < 0 && !deficit) deficit = { day: t, shortfall: -balance, trigger: [...due].sort((a, b) => b.amount - a.amount)[0] ?? null };
  }
  return { cash, dailyIn, dailyOut, deficit, lowest, dueTotal: open.filter((o) => o.due <= dayOffset(days, now)).reduce((s, o) => s + o.amount, 0) };
}

/* ---------- Insights (computed from the ledger) ---------- */
export type Insight = { level: "danger" | "warning" | "success"; title: string; text: string; action?: "loan" | "finix" | "entry" };

const pctChange = (cur: number, prev: number) => Math.round(((cur - prev) / prev) * 100);
export const daysUntil = (due: string, now = new Date()) => Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${dateInputValue(now)}T12:00:00`)) / DAY);
export const shortDate = (due: string) => new Date(`${due}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

export function getInsights(all: Tx[], p: Profile, items: Planned[] = [], now = new Date()): Insight[] {
  const curTx = rollingDays(all, 0, 30, now);
  const prevTx = rollingDays(all, 30, 60, now);
  const cur = summarize(curTx);
  const prev = summarize(prevTx);
  const f = forecastCash(all, p, items, 30, now);
  const out: Insight[] = [];

  if (f.cash < 0) out.push({ level: "danger", title: `Kas minus ${rp(-f.cash)}`, text: "Pengeluaran tercatat sudah melebihi uang yang ada. Periksa catatan atau cari tambahan modal.", action: "loan" });
  else if (f.deficit) {
    const why = f.deficit.trigger ? `Setelah ${f.deficit.trigger.label} ${rp(f.deficit.trigger.amount)} jatuh tempo ${shortDate(f.deficit.trigger.due)}, kas kurang ${rp(f.deficit.shortfall)}.` : `Pengeluaran rata-rata ${rp(f.dailyOut)}/hari lebih besar dari pemasukan ${rp(f.dailyIn)}/hari.`;
    out.push({ level: f.deficit.day <= 14 ? "danger" : "warning", title: `Kas diperkirakan minus dalam ${f.deficit.day} hari`, text: `${why} Siapkan modal atau tunda sebagian belanja.`, action: "loan" });
  }

  const dueSoon = openPlanned(items).filter((o) => o.kind === "debt" && daysUntil(o.due, now) <= 7)[0];
  if (dueSoon) {
    const d = daysUntil(dueSoon.due, now);
    out.push({ level: "warning", title: d < 0 ? `${dueSoon.label} terlambat ${-d} hari` : d === 0 ? `${dueSoon.label} jatuh tempo hari ini` : `${dueSoon.label} jatuh tempo ${d} hari lagi`, text: `${rp(dueSoon.amount)} perlu dibayar ${shortDate(dueSoon.due)}. Sisihkan dari penjualan beberapa hari ke depan.` });
  }

  if (cur.net < 0) out.push({ level: "danger", title: `30 hari terakhir rugi ${rp(-cur.net)}`, text: "Pengeluaran lebih besar dari pemasukan. Tanya Finix biaya mana yang bisa ditekan.", action: "finix" });
  else if (cur.revenue > 0 && cur.net / cur.revenue < 0.1) out.push({ level: "warning", title: "Margin bersih tipis", text: `Dari tiap Rp100 penjualan hanya tersisa Rp${Math.round((cur.net / cur.revenue) * 100)}. Tinjau harga jual atau biaya terbesar.`, action: "finix" });

  const prevByCat = new Map(group(prevTx.filter((t) => t.type === "expense")).map((g) => [g.label, g.value]));
  const rise = group(curTx.filter((t) => t.type === "expense"))
    .map((g) => ({ ...g, before: prevByCat.get(g.label) ?? 0 }))
    .filter((g) => g.before > 0 && g.value - g.before >= 50000 && g.value / g.before >= 1.15)
    .sort((a, b) => b.value - b.before - (a.value - a.before))[0];
  if (rise) out.push({ level: "warning", title: `Biaya ${rise.label.toLowerCase()} naik ${pctChange(rise.value, rise.before)}%`, text: `${rp(rise.value)} dalam 30 hari terakhir, sebelumnya ${rp(rise.before)}.`, action: "finix" });

  if (prev.revenue > 0) {
    const ch = pctChange(cur.revenue, prev.revenue);
    if (ch >= 5) out.push({ level: "success", title: `Pemasukan naik ${ch}%`, text: `${rp(cur.revenue)} dalam 30 hari terakhir, sebelumnya ${rp(prev.revenue)}.` });
    else if (ch <= -10) out.push({ level: "warning", title: `Pemasukan turun ${-ch}%`, text: `${rp(cur.revenue)} dalam 30 hari terakhir, sebelumnya ${rp(prev.revenue)}.`, action: "finix" });
  }

  if (p.target && cur.revenue >= p.target.amount) out.push({ level: "success", title: "Target omzet tercapai", text: `Omzet 30 hari terakhir ${rp(cur.revenue)}, melewati target ${rp(p.target.amount)}.` });

  const last = all.reduce((m, t) => Math.max(m, Date.parse(t.date)), 0);
  const idle = last ? Math.floor((now.getTime() - last) / DAY) : Infinity;
  if (idle >= 3) out.push({ level: "warning", title: all.length ? `Sudah ${idle} hari belum mencatat` : "Belum ada transaksi", text: "Catatan yang rutin membuat laporan akurat dan memudahkan pengajuan modal.", action: "entry" });

  if (!out.length) out.push({ level: "success", title: "Arus kas terpantau sehat", text: `Saldo ${rp(f.cash)} dan belum ada tanda bahaya dari catatanmu.` });
  const rank = { danger: 0, warning: 1, success: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Average figures lenders look at, taken from the last 90 days of records. */
export function getCreditProfile(all: Tx[]) {
  const recent = rollingDays(all, 0, 90);
  const s = summarize(recent);
  const first = all.reduce((m, t) => Math.min(m, Date.parse(t.date)), Date.now());
  const months = Math.max(1, Math.min(3, Math.ceil((Date.now() - first) / (30 * DAY))));
  return {
    monthlyRevenue: s.revenue / months,
    monthlyProfit: s.net / months,
    margin: s.revenue ? s.net / s.revenue : 0,
    txCount: all.length,
    recordedDays: all.length ? Math.max(1, Math.round((Date.now() - first) / DAY)) : 0,
  };
}

export function buildFinancialContext(all: Tx[], p: Profile = defaultProfile, items: Planned[] = []) {
  const m = getStatements(all, "month", p, items);
  const t = m.totals;
  const cur = summarize(rollingDays(all, 0, 30));
  const prev = summarize(rollingDays(all, 30, 60));
  const f = forecastCash(all, p, items);
  const pct = (n: number, base: number) => (base ? ((n / base) * 100).toFixed(1) : "0");
  const cats = (txs: Tx[]) => group(txs.filter((x) => x.type === "expense")).map((o) => `${o.label} ${rp(o.value)}`).join(", ") || "-";
  const recent = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
    .map((x) => `${x.title} ${x.type === "income" ? "+" : "-"}${rp(x.amount)} (${x.category}, ${new Date(x.date).toLocaleDateString("id-ID")})`).join("; ");
  const due = openPlanned(items).map((o) => `${o.label} ${rp(o.amount)} (${o.kind === "debt" ? "utang" : "belanja terjadwal"}, jatuh tempo ${o.due})`).join("; ");
  return `Usaha: ${p.name} (kategori ${p.category}). Tanggal hari ini ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. Semua angka berasal dari catatan transaksi pengguna.
Bulan kalender berjalan: pendapatan ${rp(t.revenue)}; HPP ${rp(t.cogs)}; laba kotor ${rp(t.gross)}; beban operasional ${rp(t.opex)}; laba bersih ${rp(t.net)}.
30 hari terakhir: pendapatan ${rp(cur.revenue)}; pengeluaran ${rp(cur.expense)} (${cats(rollingDays(all, 0, 30))}); laba bersih ${rp(cur.net)}; margin kotor ${pct(cur.gross, cur.revenue)}%, margin bersih ${pct(cur.net, cur.revenue)}%.
30 hari sebelumnya: pendapatan ${rp(prev.revenue)}; pengeluaran ${rp(prev.expense)} (${cats(rollingDays(all, 30, 60))}); laba bersih ${rp(prev.net)}.
Saldo kas saat ini ${rp(m.cash)}. Peralatan ${rp(p.equipment)}, persediaan ${rp(p.inventory)}.
Kewajiban mendatang yang belum dibayar: ${due || "tidak ada"}.
Proyeksi kas 30 hari: ${f.deficit ? `diperkirakan minus pada hari ke-${f.deficit.day} dengan kekurangan ${rp(f.deficit.shortfall)}` : `tidak minus; saldo terendah ${rp(f.lowest.balance)}`}.
Target omzet 30 hari: ${p.target ? `${rp(p.target.amount)} (naik ${p.target.pct}%)` : "belum dipasang"}.
Peringatan yang dihitung aplikasi: ${getInsights(all, p, items).map((a) => a.title).join("; ")}.
Fitur aplikasi (simulasi): Ajukan Modal mencocokkan KUR Mikro (6%/thn), Koperasi UMKM (12%/thn), Pembiayaan Pemasok (tempo 60 hari, 2%), Pinjaman Digital Produktif (24%/thn); Asuransi Toko untuk kebakaran, pencurian, gangguan usaha, kesehatan karyawan.
Transaksi terbaru: ${recent || "belum ada"}.`;
}
