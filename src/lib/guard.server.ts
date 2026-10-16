// Abuse protection for the AI endpoints, applied before any AI call is made:
//   - only the app's own pages may call them (cross-site requests are refused),
//   - request bodies have a size cap,
//   - each client gets a per-minute and per-day request budget.
// The budget lives in this server process's memory. On serverless hosts every warm
// instance keeps its own count, so the limit is per instance, not global; it still stops
// a single client from looping requests. Optional overrides:
//   AI_RATE_PER_MINUTE (default 20), AI_RATE_PER_DAY (default 300), ALLOWED_ORIGINS (comma list)

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const deny = (error: string, status: number, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers });

const envNumber = (key: string, fallback: number) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The caller's IP as reported by the hosting platform's proxy. */
export function clientIp(request: Request): string {
  const h = request.headers;
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  return h.get("cf-connecting-ip") ?? h.get("x-nf-client-connection-ip") ?? first(h.get("x-vercel-forwarded-for")) ?? h.get("x-real-ip") ?? first(h.get("x-forwarded-for")) ?? "unknown";
}

/** Browsers send Origin and Sec-Fetch-Site; a page on another site must not spend this app's AI budget. */
function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin GETs and non-browser clients; the rate limit still applies
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set([new URL(request.url).host, request.headers.get("x-forwarded-host"), request.headers.get("host")]);
  for (const o of (process.env["ALLOWED_ORIGINS"] ?? "").split(",")) {
    try {
      if (o.trim()) allowed.add(new URL(o.trim()).host);
    } catch {
      /* ignore a malformed entry */
    }
  }
  return allowed.has(host);
}

type Bucket = { minuteStart: number; minute: number; dayStart: number; day: number };
const buckets = new Map<string, Bucket>();

/** Counts one request for `key`; returns seconds to wait when over budget, otherwise null. */
function spend(key: string, perMinute: number, perDay: number, now = Date.now()): number | null {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (now - b.dayStart > DAY) buckets.delete(k);
  }
  const b = buckets.get(key) ?? { minuteStart: now, minute: 0, dayStart: now, day: 0 };
  if (now - b.minuteStart >= MINUTE) Object.assign(b, { minuteStart: now, minute: 0 });
  if (now - b.dayStart >= DAY) Object.assign(b, { dayStart: now, day: 0 });
  buckets.set(key, b);
  if (b.day >= perDay) return Math.ceil((b.dayStart + DAY - now) / 1000);
  if (b.minute >= perMinute) return Math.ceil((b.minuteStart + MINUTE - now) / 1000);
  b.minute++;
  b.day++;
  return null;
}

/** For tests. */
export const resetRateLimits = () => buckets.clear();

/**
 * Checks origin, size and budget, then parses the JSON body.
 * Returns `{ body }` to continue, or `{ response }` to send back as is.
 */
export async function guardAiRequest(request: Request, opts: { endpoint: "chat" | "scan"; maxBytes: number }): Promise<{ body: unknown; response?: undefined } | { response: Response; body?: undefined }> {
  if (!sameOrigin(request)) return { response: deny("Permintaan ditolak.", 403) };

  const declared = Number(request.headers.get("content-length"));
  if (declared > opts.maxBytes) return { response: deny("Kiriman terlalu besar.", 413) };

  // Scanning costs more than chatting, so it gets a smaller share of the budget.
  const perMinute = envNumber("AI_RATE_PER_MINUTE", 20);
  const perDay = envNumber("AI_RATE_PER_DAY", 300);
  const share = opts.endpoint === "scan" ? 0.4 : 1;
  const wait = spend(`${opts.endpoint}:${clientIp(request)}`, Math.max(1, Math.floor(perMinute * share)), Math.max(1, Math.floor(perDay * share)));
  if (wait !== null) return { response: deny("Terlalu banyak permintaan ke AI. Coba lagi sebentar.", 429, { "retry-after": String(wait) }) };

  const text = await request.text().catch(() => null);
  if (text === null) return { response: deny("Permintaan tidak valid.", 400) };
  if (text.length > opts.maxBytes) return { response: deny("Kiriman terlalu besar.", 413) };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { response: deny("Permintaan tidak valid.", 400) };
  }
}
