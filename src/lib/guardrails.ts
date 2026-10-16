// Tier-3 actions (PRD section 8): Finix must always refuse them, and the refusal is logged.
// Finix cannot do any of these anyway; catching them here means the refusal is fixed text,
// costs no AI call, and shows up in the activity log as "blocked".
// The patterns look for a request to act (move money, touch someone else's data, send data
// out), not for the topic: "apakah kas cukup untuk bayar supplier?" is a normal question.

export type ForbiddenKind = "move_money" | "others_data" | "send_data_out";

const ask = String.raw`(?:tolong|bantu|coba|bisa|bisakah|bisa\s+gak|bisa\s+nggak|minta|aku\s+mau|saya\s+mau|aku\s+ingin|saya\s+ingin|segera|langsung|please|can\s+you|could\s+you|i\s+want\s+you\s+to)`;
const money = String.raw`(?:uang|dana|duit|saldo|kas|rp\s?[\d.]+|\d+\s?(?:rb|ribu|jt|juta))`;

const rules: { kind: ForbiddenKind; re: RegExp }[] = [
  // "transfer 2 juta ke supplier", "tolong kirim uang ke Budi", "tarik dana dari kas", "please transfer"
  { kind: "move_money", re: new RegExp(String.raw`^\s*(?:${ask}\s+)?(?:transfer(?:kan)?|tf|kirim(?:kan|in)?\s+${money}|pindah(?:kan|in)?\s+${money}|tarik(?:kan)?\s+${money}|cair(?:kan|in)\s+${money}|bayar(?:kan|in)\s+(?:\S+\s+){0,4}ke|top\s?up)\b`, "i") },
  { kind: "move_money", re: new RegExp(String.raw`\b${ask}\s+(?:transfer(?:kan)?|tf|kirim(?:kan|in)?\s+${money}|pindah(?:kan|in)?\s+${money}|tarik(?:kan)?\s+${money}|cair(?:kan|in)\s+${money}|bayar(?:kan|in))\b`, "i") },
  { kind: "move_money", re: /\b(?:send|transfer|wire|pay)\s+(?:rp|idr|\$|\d)/i },
  // "ubah data usaha orang lain", "hapus transaksi milik toko sebelah", "lihat data akun lain"
  { kind: "others_data", re: /\b(?:ubah|ganti|hapus|edit|lihat|buka|baca|akses)\w*\s+(?:data|transaksi|catatan|laporan|akun|saldo)\s+(?:\w+\s+){0,2}(?:orang\s+lain|pengguna\s+lain|akun\s+lain|usaha\s+lain|toko\s+lain|milik\s+(?!saya|aku|ku)\w+|toko\s+sebelah)/i },
  { kind: "others_data", re: /\b(?:change|delete|edit|view|access|read)\s+(?:\w+\s+){0,2}(?:other|another)\s+(?:user|account|business)/i },
  // "kirim laporanku ke email bank", "share data transaksi ke pihak ketiga", "ekspor data ke whatsapp"
  { kind: "send_data_out", re: /\b(?:kirim|kirimkan|share|bagikan|ekspor|export|unggah|upload|teruskan)\w*\s+(?:semua\s+)?(?:data|laporan|catatan|transaksi)\w*\s+(?:\w+\s+){0,3}ke\s+(?:email|e-mail|wa\b|whatsapp|telegram|bank|pihak|orang|nomor|server|alamat|link|\S+@\S+)/i },
  { kind: "send_data_out", re: /\b(?:send|share|export|upload|email)\s+(?:my\s+|all\s+|the\s+)*(?:data|report|records|transactions)\s+to\b/i },
];

export function forbiddenRequest(text: string): ForbiddenKind | null {
  const t = text.trim();
  if (!t) return null;
  return rules.find((r) => r.re.test(t))?.kind ?? null;
}

export function refusalText(kind: ForbiddenKind, lang: "id" | "en" = "id"): string {
  if (lang === "en") {
    const what = { move_money: "move money", others_data: "read or change another person's data", send_data_out: "send your data outside FinTar" }[kind];
    return `I can't ${what}. This kind of action is always blocked for your safety, and the attempt is recorded in the Activity Log.\n\nI can still help you **check whether your cash is enough** or **plan the payment**. If you want a copy of your reports, use **Reports > PDF / Excel** yourself (it asks for your PIN).`;
  }
  const what = { move_money: "memindahkan uang", others_data: "membaca atau mengubah data orang lain", send_data_out: "mengirim datamu ke luar FinTar" }[kind];
  return `Maaf, aku tidak bisa ${what}. Tindakan seperti ini selalu diblokir demi keamananmu, dan percobaannya dicatat di Log Aktivitas.\n\nAku tetap bisa bantu **mengecek apakah kas cukup** atau **menyusun rencana pembayarannya**. Kalau butuh salinan laporan, unduh sendiri lewat **Laporan > PDF / Excel** (perlu PIN).`;
}
