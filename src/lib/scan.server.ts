import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export type ScanResult = {
  merchant: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
};

const PROMPT = `Kamu adalah mesin OCR struk/nota belanja. Baca semua teks pada gambar struk ini.
Balas HANYA dengan JSON (tanpa markdown) berbentuk:
{"merchant": string, "date": string, "items": [{"name": string, "qty": number, "price": number}], "total": number}
- price = harga total baris dalam Rupiah (angka bulat, tanpa titik/koma).
- total = jumlah akhir yang dibayar. Jika tidak terlihat, jumlahkan items.
- Jika gambar bukan struk, balas {"merchant":"","date":"","items":[],"total":0}.`;

export async function handleScan(request: Request) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI belum dikonfigurasi." }, { status: 500 });

  let image: string;
  try {
    const body = (await request.json()) as { image?: unknown };
    if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) throw new Error();
    image = body.image;
  } catch {
    return Response.json({ error: "Foto struk tidak valid." }, { status: 400 });
  }

  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });

  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image", image: new URL(image) }] }],
      abortSignal: request.signal,
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
      },
    });
    const text = await result.text;
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as ScanResult;
    const items = (Array.isArray(parsed.items) ? parsed.items : []).map((i) => ({
      name: String(i.name ?? "Item"),
      qty: Number(i.qty) || 1,
      price: Math.round(Number(i.price) || 0),
    }));
    const total = Math.round(Number(parsed.total) || items.reduce((s, i) => s + i.price, 0));
    return Response.json({ merchant: String(parsed.merchant ?? ""), date: String(parsed.date ?? ""), items, total } satisfies ScanResult);
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 429) return Response.json({ error: "Sedang ramai, coba lagi sebentar." }, { status: 429 });
    if (status === 402) return Response.json({ error: "Kuota AI habis. Tambahkan kredit di pengaturan workspace." }, { status: 402 });
    return Response.json({ error: "Struk tidak bisa dibaca. Coba foto lebih jelas." }, { status: 500 });
  }
}
