import { dateInputToIso, expenseCategories, incomeCategories, type Category, type Tx } from "./financials";

/* ---------- Auto-categorisation from the description ---------- */
const rules: { category: Category; type: Tx["type"]; words: string[] }[] = [
  { category: "Bahan baku", type: "expense", words: ["tepung", "terigu", "mentega", "butter", "telur", "gula", "ragi", "susu", "cokelat", "coklat", "keju", "minyak", "garam", "bahan", "stok", "kemasan", "dus", "kotak", "plastik", "stiker"] },
  { category: "Pengiriman", type: "expense", words: ["ongkir", "kurir", "kirim", "ekspedisi", "jne", "j&t", "sicepat", "gosend", "grab", "gojek", "bensin", "antar"] },
  { category: "Listrik & gas", type: "expense", words: ["listrik", "pln", "token", "gas", "lpg", "elpiji", "pdam", "air", "internet", "wifi"] },
  { category: "Upah karyawan", type: "expense", words: ["gaji", "upah", "thr", "lembur", "bonus", "karyawan", "pegawai"] },
  { category: "Penjualan", type: "income", words: ["jual", "penjualan", "roti", "kue", "pesanan", "katering", "catering", "order", "kasir", "gofood", "grabfood", "shopeefood", "reseller", "grosir"] },
];

/** Best-matching category for a description, or null when no keyword matches. */
export function suggestCategory(text: string, type: Tx["type"]): Category | null {
  const words = text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
  let best: { category: Category; hits: number } | null = null;
  for (const rule of rules) {
    if (rule.type !== type) continue;
    const hits = rule.words.filter((w) => words.some((x) => x === w || (w.length > 3 && x.startsWith(w)))).length;
    if (hits > (best?.hits ?? 0)) best = { category: rule.category, hits };
  }
  return best?.category ?? null;
}

/* ---------- CSV import ---------- */
// Byte order mark: Excel writes it at the start of CSV files and needs it to read UTF-8.
const BOM = String.fromCharCode(0xfeff);
export type CsvResult = { rows: Omit<Tx, "id">[]; errors: { line: number; reason: string }[] };

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Reads "1.500.000", "1,500,000", "Rp 250.000,50" and plain "75000"; null when not a positive number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/rp|idr|\s/gi, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else {
    const dec = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    if (dec >= 0) s = `${s.slice(0, dec).replace(/[.,]/g, "")}.${s.slice(dec + 1)}`;
  }
  const n = Math.round(Number(s));
  return n > 0 ? n : null;
}

function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  const [y, m, d] = iso ? [iso[1]!, iso[2]!, iso[3]!] : dmy ? [dmy[3]!, dmy[2]!, dmy[1]!] : [];
  if (!y || !m || !d) return null;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null;
}

const headerNames = {
  date: ["tanggal", "date", "tgl"],
  type: ["jenis", "tipe", "type"],
  amount: ["jumlah", "nominal", "amount", "nilai"],
  category: ["kategori", "category"],
  title: ["keterangan", "deskripsi", "description", "catatan"],
};
const incomeWords = ["income", "pemasukan", "masuk", "kredit", "credit", "cr"];
const expenseWords = ["expense", "pengeluaran", "keluar", "debit", "dr"];
const allCategories = [...incomeCategories, ...expenseCategories];

/** Columns are matched by header name; without a header the order is tanggal, jenis, jumlah, kategori, keterangan. */
export function parseCsv(text: string): CsvResult {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const result: CsvResult = { rows: [], errors: [] };
  if (first < 0) return result;
  const sep = (lines[first]!.match(/;/g)?.length ?? 0) > (lines[first]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = splitLine(lines[first]!, sep).map((h) => h.toLowerCase());
  const find = (names: string[]) => head.findIndex((h) => names.includes(h));
  const hasHeader = find(headerNames.date) >= 0 || find(headerNames.amount) >= 0;
  const col = hasHeader
    ? { date: find(headerNames.date), type: find(headerNames.type), amount: find(headerNames.amount), category: find(headerNames.category), title: find(headerNames.title) }
    : { date: 0, type: 1, amount: 2, category: 3, title: 4 };
  if (col.date < 0 || col.amount < 0) {
    result.errors.push({ line: first + 1, reason: 'Judul kolom harus memuat "tanggal" dan "jumlah".' });
    return result;
  }

  for (let i = hasHeader ? first + 1 : first; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const cells = splitLine(lines[i]!, sep);
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? "") : "");
    const date = parseDate(cell(col.date));
    if (!date) { result.errors.push({ line: i + 1, reason: `Tanggal "${cell(col.date)}" tidak dikenali. Pakai 2026-10-09 atau 09/10/2026.` }); continue; }
    const amount = parseAmount(cell(col.amount));
    if (!amount) { result.errors.push({ line: i + 1, reason: `Jumlah "${cell(col.amount)}" bukan angka yang valid.` }); continue; }
    const title = cell(col.title).slice(0, 80);
    const rawType = cell(col.type).toLowerCase();
    const rawCategory = cell(col.category);
    const known = allCategories.find((c) => c.toLowerCase() === rawCategory.toLowerCase());
    const type: Tx["type"] | null = incomeWords.includes(rawType) ? "income" : expenseWords.includes(rawType) ? "expense" : known ? (incomeCategories.includes(known) ? "income" : "expense") : suggestCategory(title, "income") ? "income" : suggestCategory(title, "expense") ? "expense" : null;
    if (!type) { result.errors.push({ line: i + 1, reason: 'Jenis tidak jelas. Isi kolom jenis dengan "pemasukan" atau "pengeluaran".' }); continue; }
    const fits = known && (type === "income" ? incomeCategories : expenseCategories).includes(known);
    const category = (fits ? known : null) ?? suggestCategory(`${title} ${rawCategory}`, type) ?? (type === "income" ? "Pemasukan lain" : "Lainnya");
    result.rows.push({ title: title || rawCategory || category, amount, type, category, date: dateInputToIso(date), source: "csv" });
  }
  return result;
}

export const csvTemplate = `tanggal;jenis;jumlah;kategori;keterangan
09/10/2026;pemasukan;320.000;Penjualan;Penjualan roti manis pagi
09/10/2026;pengeluaran;150.000;Bahan baku;Margarin dan ragi instan
10/10/2026;pemasukan;480.000;Penjualan;Snack box rapat kantor
10/10/2026;pengeluaran;45.000;Pengiriman;Ongkir kurir bahan baku`;

/** Semicolon-separated so Excel with Indonesian regional settings opens it directly. */
export function toCsv(txs: Tx[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
    const d = new Date(t.date);
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return [date, t.type === "income" ? "pemasukan" : "pengeluaran", String(t.amount), t.category, t.title].map(esc).join(";");
  });
  return `${BOM}tanggal;jenis;jumlah;kategori;keterangan\n${rows.join("\n")}\n`;
}
