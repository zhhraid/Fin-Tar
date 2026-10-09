import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { cloudEnabled, supabaseAnonKey, supabaseUrl } from "./env";
import { blankProfile, clearStores, hydrateStores, parseActivity, parseLedger, parseLoan, parsePlanned, setRemote, type Activity, type LoanApplication, type Planned, type Profile, type Remote, type Tx } from "./financials";

// Supabase sync. Tables and security rules are in supabase/migrations/.
// Every query runs as the signed-in user; Row Level Security in the database
// decides what they may read or change, so nothing here filters by user for safety.

/* ---------- Auth state ---------- */
export type AuthState =
  | { status: "local" } // Supabase not configured: data stays on this device
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string };

const initial: AuthState = cloudEnabled ? { status: "loading" } : { status: "local" };
let auth: AuthState = initial;
const listeners = new Set<() => void>();
const setAuth = (next: AuthState) => {
  auth = next;
  listeners.forEach((l) => l());
};
export const useAuth = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => auth,
    () => initial,
  );

let client: SupabaseClient | null = null;
const supabase = () => (client ??= createClient(supabaseUrl, supabaseAnonKey));

let reportError: (message: string) => void = () => {};
const fail = (e: unknown) => reportError(`Gagal menyimpan ke server: ${e instanceof Error ? e.message : (e as { message?: string })?.message ?? "kesalahan tak dikenal"}`);

/* ---------- Row mapping ---------- */
type Row = Record<string, unknown>;
const txRow = (businessId: string) => (t: Tx) => ({ id: t.id, business_id: businessId, type: t.type, amount: t.amount, category: t.category, description: t.title, date: t.date, source: t.source ?? "manual" });
const txFromRow = (r: Row) => ({ id: r["id"], title: r["description"], amount: r["amount"], type: r["type"], category: r["category"], date: r["date"], source: r["source"] });
const profileRow = (p: Profile) => ({ name: p.name || blankProfile.name, category: p.category || blankProfile.category, opening_cash: p.openingCash, inventory: p.inventory, equipment: p.equipment, target_pct: p.target?.pct ?? null, target_amount: p.target?.amount ?? null });
const profileFromRow = (r: Row): Profile => ({
  name: String(r["name"]),
  category: String(r["category"]),
  openingCash: Number(r["opening_cash"]) || 0,
  inventory: Number(r["inventory"]) || 0,
  equipment: Number(r["equipment"]) || 0,
  target: Number(r["target_pct"]) > 0 && Number(r["target_amount"]) > 0 ? { pct: Number(r["target_pct"]), amount: Number(r["target_amount"]) } : null,
});
const activityRow = (a: Activity) => ({ id: a.id, tool: a.tool, tier: a.tier, status: a.status, input: { summary: a.summary }, output: a.detail ?? {}, timestamp: a.at });

async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/* ---------- Load the account into the stores ---------- */
async function loadAccount(user: User) {
  const db = supabase();
  let business = ((await must(db.from("businesses").select("*").limit(1))) ?? [])[0] as Row | undefined;
  if (!business) {
    const name = String(user.user_metadata?.["business_name"] ?? "").trim().slice(0, 40) || blankProfile.name;
    business = (await must(db.from("businesses").insert({ ...profileRow(blankProfile), name }).select().single())) as Row;
  }
  const businessId = String(business["id"]);
  const [txs, debts, scheduled, consents, proposals, actions] = await Promise.all([
    must(db.from("transactions").select("*").order("date", { ascending: false }).limit(5000)),
    must(db.from("debts").select("*")),
    must(db.from("scheduled_expenses").select("*")),
    must(db.from("consents").select("granted").eq("type", "ai_processing").order("timestamp", { ascending: false }).limit(1)),
    must(db.from("proposals").select("*").order("submitted_at", { ascending: false }).limit(1)),
    must(db.from("agent_actions").select("*").order("timestamp", { ascending: false }).limit(200)),
  ]);
  const proposal = (proposals as Row[])[0];
  hydrateStores({
    ledger: parseLedger((txs as Row[]).map(txFromRow)),
    profile: profileFromRow(business),
    planned: parsePlanned([
      ...(debts as Row[]).map((d) => ({ id: d["id"], kind: "debt", label: d["supplier"], amount: d["amount"], due: d["due_date"], done: d["status"] === "paid" })),
      ...(scheduled as Row[]).map((s) => ({ id: s["id"], kind: "expense", label: s["label"], amount: s["amount"], due: s["date"], done: s["done"] === true })),
    ]),
    consent: (consents as Row[])[0]?.["granted"] === true,
    activity: parseActivity((actions as Row[]).map((a) => ({ id: a["id"], at: a["timestamp"], tool: a["tool"], tier: a["tier"], status: a["status"], summary: (a["input"] as Row | null)?.["summary"], detail: a["output"] }))),
    loan: proposal ? parseLoan({ id: proposal["id"], lender: proposal["lender"], amount: Number(proposal["amount"]), purpose: proposal["purpose"], tenor: proposal["tenor"], installment: Number(proposal["installment"]), submittedAt: Date.parse(String(proposal["submitted_at"])) }) : null,
  });
  setRemote(remoteFor(businessId), fail);
}

function remoteFor(businessId: string): Remote {
  const db = supabase();
  const toTx = txRow(businessId);
  const plannedTable = (p: Planned) => (p.kind === "debt" ? "debts" : "scheduled_expenses");
  const plannedRow = (p: Planned): Row =>
    p.kind === "debt"
      ? { id: p.id, business_id: businessId, supplier: p.label, amount: p.amount, due_date: p.due, status: p.done ? "paid" : "unpaid" }
      : { id: p.id, business_id: businessId, label: p.label, amount: p.amount, date: p.due, done: p.done };
  // Typing in Profil fires on every keystroke; only the last value within the window is saved.
  let profileTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    upsertTxs: async (txs) => void (await must(db.from("transactions").upsert(txs.map(toTx)))),
    deleteTx: async (id) => void (await must(db.from("transactions").delete().eq("id", id))),
    replaceData: async (txs, planned) => {
      await Promise.all([
        must(db.from("transactions").delete().eq("business_id", businessId)),
        must(db.from("debts").delete().eq("business_id", businessId)),
        must(db.from("scheduled_expenses").delete().eq("business_id", businessId)),
      ]);
      await must(db.from("transactions").insert(txs.map(toTx)));
      for (const p of planned) await must(db.from(plannedTable(p)).insert(plannedRow(p)));
    },
    saveProfile: (p) =>
      new Promise((resolve, reject) => {
        clearTimeout(profileTimer);
        profileTimer = setTimeout(() => must(db.from("businesses").update(profileRow(p)).eq("id", businessId)).then(() => resolve(), reject), 600);
      }),
    upsertPlanned: async (p) => void (await must(db.from(plannedTable(p)).upsert(plannedRow(p)))),
    deletePlanned: async (p) => void (await must(db.from(plannedTable(p)).delete().eq("id", p.id))),
    setConsent: async (granted) => void (await must(db.from("consents").insert({ type: "ai_processing", granted }))),
    logActivity: async (a) => void (await must(db.from("agent_actions").insert(activityRow(a)))),
    saveLoan: async (a: LoanApplication | null) => {
      await must(db.from("proposals").delete().eq("business_id", businessId));
      if (a) await must(db.from("proposals").insert({ id: a.id, business_id: businessId, lender: a.lender, amount: a.amount, purpose: a.purpose, tenor: a.tenor, installment: a.installment, submitted_at: new Date(a.submittedAt).toISOString() }));
    },
  };
}

/* ---------- Session lifecycle ---------- */
let started = false;
let loadedFor: string | null = null;

async function enter(user: User | null) {
  if (!user) {
    loadedFor = null;
    setRemote(null);
    clearStores();
    window.localStorage.removeItem("fintar-finix-chat"); // chat history belongs to the account that just left
    setAuth({ status: "signedOut" });
    return;
  }
  if (loadedFor === user.id) return;
  loadedFor = user.id;
  setAuth({ status: "loading" });
  try {
    await loadAccount(user);
    setAuth({ status: "signedIn", email: user.email ?? "" });
  } catch (e) {
    loadedFor = null;
    reportError(`Gagal memuat data akun: ${e instanceof Error ? e.message : "kesalahan tak dikenal"}. Pastikan migrasi SQL sudah dijalankan.`);
    setAuth({ status: "signedOut" });
  }
}

/** Call once in the browser. `onError` shows a message to the user (e.g. a toast). */
export function startCloud(onError: (message: string) => void) {
  reportError = onError;
  if (!cloudEnabled || started) return;
  started = true;
  // The callback must not await Supabase calls itself, so loading is deferred.
  supabase().auth.onAuthStateChange((_event, session) => {
    setTimeout(() => void enter(session?.user ?? null), 0);
  });
}

const authMessage = (message: string) =>
  /invalid login/i.test(message) ? "Email atau kata sandi salah."
  : /already registered/i.test(message) ? "Email ini sudah terdaftar. Silakan masuk."
  : /at least 6/i.test(message) ? "Kata sandi minimal 6 karakter."
  : /not confirmed/i.test(message) ? "Email belum dikonfirmasi. Cek kotak masukmu."
  : /rate limit/i.test(message) ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
  : message;

/** Returns an error message, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  return error ? authMessage(error.message) : null;
}

/** Returns "confirm" when Supabase sent a confirmation email instead of signing in. */
export async function signUp(email: string, password: string, businessName: string): Promise<{ error: string | null; confirm: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { data: { business_name: businessName.trim().slice(0, 40) } } });
  return { error: error ? authMessage(error.message) : null, confirm: !error && !data.session };
}

export const signOut = () => supabase().auth.signOut();

/** Removes every row the account owns, then signs out. The login itself stays; see README. */
export async function deleteMyData(): Promise<string | null> {
  const { error } = await supabase().rpc("delete_my_data");
  if (error) return error.message;
  await signOut();
  return null;
}

/** Authorization header for the AI endpoints; empty in device mode. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!cloudEnabled) return {};
  const { data } = await supabase().auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}
