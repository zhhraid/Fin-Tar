import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Cloud mode against an in-memory stand-in for Supabase. It checks FinTar's side of the
// contract (which tables and columns are written, and that an account's rows load back).
// It does not exercise real Row Level Security; that lives in supabase/migrations/.
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Session = { user: { id: string; email: string; user_metadata: Row }; access_token: string };
  const tables: Record<string, Row[]> = {};
  const state: { session: Session | null; listener: ((event: string, session: Session | null) => void) | null; ids: number } = { session: null, listener: null, ids: 0 };
  const owner = (table: string): Row => (table === "businesses" ? { owner_id: state.session?.user.id } : table === "consents" || table === "agent_actions" ? { user_id: state.session?.user.id } : {});

  function from(table: string) {
    const q: { op: string; payload: Row | Row[] | null; filters: [string, unknown][]; single: boolean; limit: number } = { op: "select", payload: null, filters: [], single: false, limit: Infinity };
    const run = () => {
      const all = (tables[table] ??= []);
      const match = (r: Row) => q.filters.every(([k, v]) => r[k] === v);
      if (q.op === "insert" || q.op === "upsert") {
        const list = (Array.isArray(q.payload) ? q.payload : [q.payload!]).map((r) => ({ id: `row-${++state.ids}`, ...owner(table), ...r }));
        for (const r of list) {
          const i = all.findIndex((x) => x["id"] === r.id);
          if (i >= 0 && q.op === "upsert") all[i] = { ...all[i], ...r };
          else all.push(r);
        }
        return { data: q.single ? list[0] : list, error: null };
      }
      if (q.op === "update") all.filter(match).forEach((r) => Object.assign(r, q.payload));
      if (q.op === "delete") tables[table] = all.filter((r) => !match(r));
      if (q.op !== "select") return { data: null, error: null };
      const found = all.filter(match).slice(0, q.limit);
      return { data: q.single ? (found[0] ?? null) : found, error: null };
    };
    const set = (op: string) => (payload: Row | Row[] | null = null) => {
      q.op = op;
      q.payload = payload;
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: set("insert"),
      upsert: set("upsert"),
      update: set("update"),
      delete: set("delete"),
      eq: (k: string, v: unknown) => (q.filters.push([k, v]), builder),
      order: () => builder,
      limit: (n: number) => ((q.limit = n), builder),
      single: () => ((q.single = true), builder),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return builder;
  }

  const enter = (email: string, meta: Row = {}) => {
    state.session = { user: { id: `user-${email}`, email, user_metadata: meta }, access_token: "token" };
    state.listener?.("SIGNED_IN", state.session);
    return { data: { session: state.session, user: state.session.user }, error: null };
  };
  const client = {
    from,
    rpc: async (name: string) => {
      if (name === "delete_my_data") for (const k of Object.keys(tables)) tables[k] = [];
      return { data: null, error: null };
    },
    auth: {
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        state.listener = cb;
        queueMicrotask(() => cb("INITIAL_SESSION", state.session));
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async ({ email }: { email: string }) => enter(email),
      signUp: async ({ email, options }: { email: string; options: { data: Row } }) => enter(email, options.data),
      signOut: async () => {
        state.session = null;
        state.listener?.("SIGNED_OUT", null);
        return { error: null };
      },
      getSession: async () => ({ data: { session: state.session } }),
    },
  };
  return { tables, client };
});

vi.mock("@/lib/env", () => ({ cloudEnabled: true, supabaseUrl: "https://contoh.supabase.co", supabaseAnonKey: "kunci-anon-contoh-untuk-pengujian" }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fake.client }));
vi.mock("@/components/FinixChat", () => ({ FinixChat: () => <p>Finix</p> }));

const { Route } = await import("@/routes/index");
const App = Route.options.component!;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const rows = (table: string) => fake.tables[table] ?? [];

describe("mode akun (Supabase)", () => {
  it("mewajibkan login, menyimpan ke tabel yang benar, dan memuat ulang data akun", async () => {
    render(<App />);
    expect(await screen.findByText("Masuk ke akunmu")).toBeInTheDocument();

    // Daftar: usaha dibuat dari nama yang diisi
    press("Daftar");
    fireEvent.change(screen.getByLabelText("Nama usaha"), { target: { value: "Toko Awan" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "awan@contoh.id" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "rahasia123" } });
    press("Daftar");

    expect(await screen.findByText(/Asisten keuangan • Toko Awan/)).toBeInTheDocument();
    expect(screen.getByText(/Catat pemasukan pertamamu/)).toBeInTheDocument();
    expect(rows("businesses")).toMatchObject([{ name: "Toko Awan", owner_id: "user-awan@contoh.id" }]);

    // Transaksi baru masuk ke tabel transactions milik usaha itu
    press("Pemasukan");
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "300000" } });
    fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Jualan roti" } });
    press("Simpan transaksi");
    await waitFor(() => expect(rows("transactions")).toHaveLength(1));
    expect(rows("transactions")[0]).toMatchObject({ business_id: rows("businesses")[0]!["id"], type: "income", amount: 300000, category: "Penjualan", description: "Jualan roti", source: "manual" });

    // Izin AI dicatat sebagai baris baru, dan masuk log aktivitas
    press("Profil");
    fireEvent.click(screen.getByRole("switch", { name: "Izinkan AI memproses catatanku" }));
    await waitFor(() => expect(rows("consents")).toMatchObject([{ type: "ai_processing", granted: true }]));
    expect(rows("agent_actions")).toMatchObject([{ tool: "update_consent", tier: "T0" }]);

    // Keluar mengosongkan layar; masuk lagi memuat data dari server
    press("Keluar");
    expect(await screen.findByText("Masuk ke akunmu")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "awan@contoh.id" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "rahasia123" } });
    press("Masuk");

    expect(await screen.findByText("Jualan roti")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Rp300.000" })).toBeInTheDocument();
    expect(rows("businesses")).toHaveLength(1);

    // Hapus semua data memanggil fungsi server lalu kembali ke layar masuk
    press("Profil");
    expect(screen.getByRole("switch", { name: "Izinkan AI memproses catatanku" })).toBeChecked();
    fireEvent.click(screen.getByText("Log aktivitas & hapus data"));
    press("Hapus semua data saya");
    press("Ya, hapus permanen");

    expect(await screen.findByText("Masuk ke akunmu")).toBeInTheDocument();
    expect(rows("transactions")).toHaveLength(0);
    expect(rows("businesses")).toHaveLength(0);
  });
});
