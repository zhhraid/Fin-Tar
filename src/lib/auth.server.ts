import { cloudEnabled, supabaseAnonKey, supabaseUrl } from "./env";

// Guards the AI endpoints. In cloud mode a request must come from a signed-in user
// whose latest AI-processing consent is "granted". In device mode there are no
// accounts, so the consent gate lives in the app only.

const deny = (error: string, status: number) => Response.json({ error }, { status });

/** Returns null when the request may proceed, otherwise the response to send back. */
export async function authorizeAi(request: Request): Promise<Response | null> {
  if (!cloudEnabled) return null;
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return deny("Masuk dulu untuk memakai fitur AI.", 401);
  const headers = { apikey: supabaseAnonKey, authorization: `Bearer ${token}` };
  // One query answers both questions: Supabase rejects an invalid or expired token with 401,
  // and Row Level Security limits the rows to the caller's own consent history.
  // Short timeout plus one retry, so a stalled connection cannot hang the user's request.
  const url = `${supabaseUrl}/rest/v1/consents?select=granted&type=eq.ai_processing&order=timestamp.desc&limit=1`;
  const get = () => fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  try {
    const res = await get().catch(get);
    if (res.status === 401 || res.status === 403) return deny("Sesi berakhir. Silakan masuk lagi.", 401);
    if (!res.ok) return deny("Tidak bisa memeriksa akun. Coba lagi.", 503);
    const rows = (await res.json()) as { granted?: boolean }[];
    if (rows[0]?.granted !== true) return deny("Izin pemrosesan AI belum diberikan.", 403);
    return null;
  } catch {
    return deny("Tidak bisa memeriksa akun. Coba lagi.", 503);
  }
}
