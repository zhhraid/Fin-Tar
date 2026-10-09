// Supabase is optional: without these two values FinTar keeps all data on the device.
export const supabaseUrl = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").trim().replace(/\/+$/, "");
export const supabaseAnonKey = String(import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "").trim();
export const cloudEnabled = /^https?:\/\//.test(supabaseUrl) && supabaseAnonKey.length > 20;
