import { useSyncExternalStore } from "react";
import { currentAccount } from "./cloud";
import { logActivity } from "./financials";

// A 6-digit PIN asked before financial data leaves the app (PDF, Excel/CSV, proposal, log)
// and before "delete all my data", the way banking apps ask before a transaction.
// It protects against someone who borrows the unlocked phone. It is not encryption: the
// data on screen is already in the browser, and the PIN only gates what the app does.
//
// Stored per account on this device as a salted PBKDF2-SHA256 hash; the PIN itself is
// never stored. Five wrong tries lock it for five minutes.

const ITERATIONS = 150_000;
export const MAX_TRIES = 5;
const LOCK_MS = 5 * 60_000;

type Saved = { v: 1; salt: string; hash: string };
type Tries = { failed: number; lockedUntil: number };

const pinKey = () => `fintar-pin-v1:${currentAccount()}`;
const triesKey = () => `fintar-pin-tries-v1:${currentAccount()}`;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

export const hasPin = () => read<Saved>(pinKey())?.v === 1;

/** Why a new PIN is refused, or null when it is fine. */
export function pinProblem(pin: string): "format" | "repeat" | "sequence" | null {
  if (!/^\d{6}$/.test(pin)) return "format";
  if (/^(\d)\1{5}$/.test(pin)) return "repeat";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "sequence";
  return null;
}

export async function setPin(pin: string) {
  if (pinProblem(pin)) throw new Error("PIN tidak memenuhi syarat");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(pinKey(), { v: 1, salt: hex(salt), hash: await derive(pin, salt) } satisfies Saved);
  write(triesKey(), null);
}

export function removePin() {
  write(pinKey(), null);
  write(triesKey(), null);
}

/** Milliseconds until a lockout ends; 0 when not locked. */
export function lockRemaining(now = Date.now()) {
  return Math.max(0, (read<Tries>(triesKey())?.lockedUntil ?? 0) - now);
}

export async function checkPin(pin: string): Promise<{ result: "ok" } | { result: "wrong"; left: number } | { result: "locked"; ms: number }> {
  const locked = lockRemaining();
  if (locked) return { result: "locked", ms: locked };
  const saved = read<Saved>(pinKey());
  if (!saved) return { result: "wrong", left: MAX_TRIES };
  if ((await derive(pin, unhex(saved.salt))) === saved.hash) {
    write(triesKey(), null);
    return { result: "ok" };
  }
  const failed = (read<Tries>(triesKey())?.failed ?? 0) + 1;
  if (failed >= MAX_TRIES) {
    write(triesKey(), { failed: 0, lockedUntil: Date.now() + LOCK_MS });
    logActivity({ tool: "pin_locked", tier: "T2", status: "blocked", summary: `PIN salah ${MAX_TRIES} kali; ekspor dan hapus data dikunci 5 menit` });
    return { result: "locked", ms: LOCK_MS };
  }
  write(triesKey(), { failed, lockedUntil: 0 });
  return { result: "wrong", left: MAX_TRIES - failed };
}

/* ---------- Asking for the PIN from anywhere in the app ---------- */
// A screen calls requestPin(); the PIN sheet mounted at the app root answers it.
export type PinRequest = { kind: "verify" | "change"; purpose: string; resolve: (ok: boolean) => void };
let pending: PinRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Resolves true once the PIN is entered (or, when none exists yet, created). */
export function requestPin(purpose: string, kind: PinRequest["kind"] = "verify"): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { kind, purpose, resolve };
    emit();
  });
}

export function finishPinRequest(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export const usePinRequest = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
    () => null,
  );

/** Runs `run` only after the PIN is entered, and records the export in the activity log. */
export async function withPin(purpose: string, summary: string, run: () => unknown) {
  if (!(await requestPin(purpose))) return false;
  logActivity({ tool: "export_data", tier: "T2", status: "approved", summary });
  await run();
  return true;
}
