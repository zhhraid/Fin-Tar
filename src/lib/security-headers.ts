import { supabaseUrl } from "./env";

// Headers added to every response the server sends (pages and API).
// The Content-Security-Policy is production-only: the Vite dev server needs inline
// scripts, eval and a websocket for hot reload.
//   - scripts and styles: this app only ('unsafe-inline' because the server-rendered page
//     carries its hydration data inline), plus Google Fonts for the stylesheet and font files
//   - connections: this app, plus the Supabase project when account mode is on
//   - framing by other sites is refused (clickjacking)

function contentSecurityPolicy(): string {
  const supabase = /^https?:\/\//.test(supabaseUrl) ? new URL(supabaseUrl).origin : "";
  const connect = ["'self'", supabase, supabase.replace(/^http/, "ws")].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(production: boolean): Record<string, string> {
  return {
    ...(production ? { "content-security-policy": contentSecurityPolicy() } : {}),
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    // Camera only for FinTar itself (receipt scan); everything else off.
    "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    "cross-origin-opener-policy": "same-origin",
  };
}

export function withSecurityHeaders(response: Response, production: boolean): Response {
  // Responses from some runtimes have immutable headers; copy before changing them.
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(securityHeaders(production))) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
