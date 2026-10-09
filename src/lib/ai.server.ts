import Anthropic from "@anthropic-ai/sdk";

// One place for every AI call. Keys stay on the server.
//   AI_PROVIDER=claude|gemini  optional; otherwise the first key found is used
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-opus-5-5)
//   GEMINI_API_KEY, GEMINI_MODEL (default gemini-flash-latest)
// With no key the app runs in demo mode (see finix-local.ts and scan.server.ts).

export type AiProvider = "claude" | "gemini" | "demo";
export type ChatTurn = { role: "user" | "assistant"; text: string };

/** An error whose message is safe to show to the user. */
export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export function aiProvider(): AiProvider {
  const wanted = env("AI_PROVIDER")?.toLowerCase();
  const claude = Boolean(env("ANTHROPIC_API_KEY"));
  const gemini = Boolean(env("GEMINI_API_KEY"));
  if (wanted === "claude" || wanted === "anthropic") return claude ? "claude" : "demo";
  if (wanted === "gemini") return gemini ? "gemini" : "demo";
  return claude ? "claude" : gemini ? "gemini" : "demo";
}

/* ---------- Claude ---------- */
const claudeModel = () => env("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
// Server-side fallback re-runs a request another model declined; only current models accept it.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const claudeExtras = (model: string, effort: "low" | "medium") => ({
  ...(/haiku/.test(model) ? {} : { output_config: { effort } }),
  ...(/^claude-(opus-5|sonnet-5-5|fable-5)/.test(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
});

function claudeError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError("Kunci API Claude tidak valid. Periksa ANTHROPIC_API_KEY.", 500);
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("Kunci API Claude tidak punya akses ke model ini.", 500);
  if (e instanceof Anthropic.NotFoundError) return new AiError(`Model Claude "${claudeModel()}" tidak ditemukan. Periksa ANTHROPIC_MODEL.`, 500);
  if (e instanceof Anthropic.RateLimitError) return new AiError("AI sedang ramai. Coba lagi sebentar.", 429);
  if (e instanceof Anthropic.APIError) return new AiError("AI gagal menjawab. Coba lagi.", 502);
  return new AiError("Tidak bisa menghubungi AI. Periksa koneksi server.", 502);
}

async function* claudeChat(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncGenerator<string> {
  const model = claudeModel();
  try {
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const stream = client.beta.messages.stream(
      { model, max_tokens: 16000, system, messages: turns.map((t) => ({ role: t.role, content: t.text })), ...claudeExtras(model, "medium") },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\nMaaf, aku tidak bisa membantu untuk permintaan itu.";
  } catch (e) {
    throw claudeError(e);
  }
}

async function claudeJson(prompt: string, image: { mime: string; data: string }, schema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const model = claudeModel();
  try {
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const extras = claudeExtras(model, "low");
    const res = await client.beta.messages.create(
      {
        model,
        max_tokens: 16000,
        ...extras,
        output_config: { ...extras.output_config, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: image.mime as "image/jpeg", data: image.data } }, { type: "text", text: prompt }] }],
      },
      { signal },
    );
    if (res.stop_reason === "refusal") throw new AiError("AI menolak membaca gambar ini.", 422);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(text);
  } catch (e) {
    throw claudeError(e);
  }
}

/* ---------- Gemini (REST) ---------- */
const geminiModel = () => env("GEMINI_MODEL") ?? "gemini-flash-latest";

async function geminiFetch(method: string, body: unknown, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") ?? "" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new AiError("Tidak bisa menghubungi AI. Periksa koneksi server.", 502);
  }
  if (res.ok) return res;
  if (res.status === 429) throw new AiError("Kuota AI habis atau sedang ramai. Coba lagi sebentar.", 429);
  if (res.status === 404) throw new AiError(`Model Gemini "${geminiModel()}" tidak ditemukan. Periksa GEMINI_MODEL.`, 500);
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiError("Kunci API Gemini tidak valid atau permintaan ditolak. Periksa GEMINI_API_KEY.", 500);
  throw new AiError("AI gagal menjawab. Coba lagi.", 502);
}

type GeminiChunk = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
const geminiText = (c: GeminiChunk) => (c.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");

async function* geminiChat(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncGenerator<string> {
  const res = await geminiFetch("streamGenerateContent?alt=sse", {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
  }, signal);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const text = geminiText(JSON.parse(line.slice(5)) as GeminiChunk);
        if (text) yield text;
      } catch {
        /* ignore keep-alive or partial lines */
      }
    }
  }
}

async function geminiJson(prompt: string, image: { mime: string; data: string }, signal: AbortSignal): Promise<unknown> {
  const res = await geminiFetch("generateContent", {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mime, data: image.data } }, { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  }, signal);
  const text = geminiText((await res.json()) as GeminiChunk);
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

/* ---------- Public API ---------- */
export function streamChat(system: string, turns: ChatTurn[], signal: AbortSignal): AsyncGenerator<string> {
  return aiProvider() === "claude" ? claudeChat(system, turns, signal) : geminiChat(system, turns, signal);
}

/** Sends one image with a prompt and returns the model's JSON answer. */
export async function imageToJson(prompt: string, dataUrl: string, schema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AiError("Format foto tidak didukung. Pakai JPG atau PNG.", 400);
  const image = { mime: match[1]!, data: match[2]! };
  try {
    return aiProvider() === "claude" ? await claudeJson(prompt, image, schema, signal) : await geminiJson(prompt, image, signal);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("Jawaban AI tidak bisa dibaca. Coba foto ulang.", 502);
  }
}
