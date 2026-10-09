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
  try {
    const user = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
    if (!user.ok) return deny("Sesi berakhir. Silakan masuk lagi.", 401);
    // Row Level Security limits this query to the caller's own consent rows.
    const res = await fetch(`${supabaseUrl}/rest/v1/consents?select=granted&type=eq.ai_processing&order=timestamp.desc&limit=1`, { headers });
    const rows = res.ok ? ((await res.json()) as { granted?: boolean }[]) : [];
    if (rows[0]?.granted !== true) return deny("Izin pemrosesan AI belum diberikan.", 403);
    return null;
  } catch {
    return deny("Tidak bisa memeriksa akun. Coba lagi.", 503);
  }
}
