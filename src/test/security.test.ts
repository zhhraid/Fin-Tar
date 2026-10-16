import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { passwordChecks, strongPassword } from "@/lib/cloud";
import { resetRateLimits } from "@/lib/guard.server";
import { forbiddenRequest } from "@/lib/guardrails";
import { handleFinixChat } from "@/lib/finix.server";
import { handleScan } from "@/lib/scan.server";

// Device mode with no AI key: the endpoints answer in demo mode, so nothing leaves the test.
vi.mock("@/lib/env", () => ({ cloudEnabled: false, supabaseUrl: "", supabaseAnonKey: "" }));

const chat = (question: string, headers: Record<string, string> = {}, extra = "") =>
  new Request("https://fintar.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://fintar.test", "x-real-ip": "10.0.0.1", ...headers },
    body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: question }] }], ledger: [], extra }),
  });
const scan = (headers: Record<string, string> = {}) =>
  new Request("https://fintar.test/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://fintar.test", "x-real-ip": "10.0.0.2", ...headers },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA" }),
  });

describe("pengaman endpoint AI", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    resetRateLimits();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("menolak permintaan dari situs lain", async () => {
    expect((await handleFinixChat(chat("halo", { origin: "https://situs-jahat.test" }))).status).toBe(403);
    expect((await handleFinixChat(chat("halo", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await handleScan(scan({ origin: "https://situs-jahat.test" }))).status).toBe(403);
    expect((await handleFinixChat(chat("halo"))).status).toBe(200);
  });

  it("menolak kiriman yang terlalu besar", async () => {
    const res = await handleFinixChat(chat("halo", {}, "x".repeat(2_100_000)));

    expect(res.status).toBe(413);
  });

  it("membatasi jumlah permintaan per menit untuk tiap pengguna", async () => {
    for (let i = 0; i < 20; i++) expect((await handleFinixChat(chat("halo"))).status).toBe(200);
    const blocked = await handleFinixChat(chat("halo"));

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another client still has its own budget.
    expect((await handleFinixChat(chat("halo", { "x-real-ip": "10.0.0.9" }))).status).toBe(200);
  });

  it("memindai struk dengan jatah lebih kecil karena lebih mahal", async () => {
    for (let i = 0; i < 8; i++) expect((await handleScan(scan())).status).toBe(200);

    expect((await handleScan(scan())).status).toBe(429);
  });

  it("menolak permintaan T3 dengan jawaban tetap tanpa memanggil AI", async () => {
    const stream = await (await handleFinixChat(chat("Tolong transfer 2 juta ke supplier tepung"))).text();
    const answer = [...stream.matchAll(/"delta":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string).join("");

    expect(answer).toContain("tidak bisa memindahkan uang");
  });
});

describe("pendeteksi permintaan T3", () => {
  it.each([
    ["Tolong transfer 2 juta ke supplier", "move_money"],
    ["transfer ke rekening Budi sekarang", "move_money"],
    ["kirim uang 500rb ke pak Joko", "move_money"],
    ["bisa tarik dana dari kas buat belanja?", "move_money"],
    ["bayarkan utang tepung ke supplier", "move_money"],
    ["please transfer 100 to my supplier", "move_money"],
    ["ubah data transaksi orang lain", "others_data"],
    ["lihat laporan milik toko sebelah", "others_data"],
    ["kirim laporan keuanganku ke email bank", "send_data_out"],
    ["share semua data transaksi ke whatsapp", "send_data_out"],
    ["send my report to supplier@example.com", "send_data_out"],
  ])("memblokir: %s", (text, kind) => {
    expect(forbiddenRequest(text)).toBe(kind);
  });

  it.each([
    "Apakah kas cukup untuk bayar supplier minggu depan?",
    "Kapan sebaiknya aku bayar utang tepung?",
    "Berapa total transfer masuk bulan ini?",
    "Jelaskan laporan keuanganku untuk periode bulan ini",
    "Biaya pengiriman naik, apa yang bisa dihemat?",
    "Aku mau omzet bulan depan naik 20%. Bantu buat rencananya.",
    "How much cash will I have in 30 days?",
  ])("tetap menjawab pertanyaan biasa: %s", (text) => {
    expect(forbiddenRequest(text)).toBeNull();
  });
});

describe("syarat kata sandi akun baru (sama dengan setelan Supabase)", () => {
  it.each([
    ["Roti#Manis2026", true],
    ["Bu-Siti_88xyz", true],
    ["Kue~Lapis 9a", true],
    ["rotimanis2026", false], // tanpa huruf besar dan simbol
    ["ROTI#MANIS2026", false], // tanpa huruf kecil
    ["Roti#Manis", false], // tanpa angka
    ["RotiManis2026", false], // tanpa simbol
    ["R#t1a", false], // terlalu pendek
    ["P@ssw0rd1", false], // kata sandi umum
  ])("%s → %s", (pw, ok) => {
    expect(strongPassword(pw)).toBe(ok);
  });

  it("mengenali semua simbol yang diterima Supabase", () => {
    for (const ch of "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~") expect(passwordChecks(`Abcdefg1${ch}`).symbol).toBe(true);
  });
});
