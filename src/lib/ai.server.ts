import Anthropic from "@anthropic-ai/sdk";

// One place for every AI call. Keys stay on the server.
//   AI_PROVIDER=claude|gemini  optional; otherwise the first key found is used
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-opus-5-5)
//   GEMINI_API_KEY, GEMINI_MODEL (default gemini-flash-lite-latest), GEMINI_FALLBACK_MODEL
// With no key the app runs in demo mode (see finix-local.ts and scan.server.ts).

export type AiProvider = "claude" | "gemini" | "demo";
export type ChatTurn = { role: "user" | "assistant"; text: string };

/** An error whose message is safe to show to the user. */
export class AiError extends Error {
  /** `message` is Indonesian; `en` is the same message in English. */
  constructor(message: string, readonly status = 502, readonly en = message) {
    super(message);
  }
  text(lang: "en" | "id") {
    return lang === "en" ? this.en : this.message;
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
  if (e instanceof Anthropic.AuthenticationError) return new AiError("Kunci API Claude tidak valid. Periksa ANTHROPIC_API_KEY.", 500, "Invalid Claude API key. Check ANTHROPIC_API_KEY.");
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("Kunci API Claude tidak punya akses ke model ini.", 500, "The Claude API key has no access to this model.");
  if (e instanceof Anthropic.NotFoundError) return new AiError(`Model Claude "${claudeModel()}" tidak ditemukan. Periksa ANTHROPIC_MODEL.`, 500, `Claude model "${claudeModel()}" not found. Check ANTHROPIC_MODEL.`);
  if (e instanceof Anthropic.RateLimitError) return new AiError("AI sedang ramai. Coba lagi sebentar.", 429, "The AI is busy. Please try again shortly.");
  if (e instanceof Anthropic.APIError) return new AiError("AI gagal menjawab. Coba lagi.", 502, "The AI failed to answer. Please try again.");
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
// The lite model is the default because the free tier allows far more requests per day
// for it than for the full flash model (20 per day when this was written), and it answers faster.
const geminiModel = () => env("GEMINI_MODEL") ?? "gemini-flash-lite-latest";
// Gemini regularly answers 503 "high demand", more so on the free tier. Each model is
// retried after a short wait, then the fallback model takes over; it has its own quota.
const geminiModels = () => [...new Set([geminiModel(), env("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-latest"])];
const RETRY_WAITS_MS = [700, 1800];
const HEADERS_TIMEOUT_MS = 45000; // per attempt, until the model starts answering (covers a slow image upload)

async function geminiFetch(method: string, body: unknown, signal: AbortSignal): Promise<Response> {
  let last = new AiError("AI sedang sangat ramai. Coba lagi sebentar.", 503, "The AI is very busy. Please try again shortly.");
  for (const model of geminiModels()) {
    for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, RETRY_WAITS_MS[attempt - 1]));
      let res: Response;
      // Aborts when the caller goes away, or when this attempt gets no answer in time.
      const attemptAbort = new AbortController();
      signal.addEventListener("abort", () => attemptAbort.abort(), { once: true });
      const timer = setTimeout(() => attemptAbort.abort(), HEADERS_TIMEOUT_MS);
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") ?? "" },
          body: JSON.stringify(body),
          signal: attemptAbort.signal,
        });
      } catch {
        if (signal.aborted) throw new AiError("Permintaan dibatalkan.", 499, "Request cancelled.");
        console.error(`[ai] Gemini ${model}: ${attemptAbort.signal.aborted ? "tidak menjawab dalam batas waktu" : "koneksi gagal"}`);
        last = new AiError("Tidak bisa menghubungi AI. Periksa koneksi lalu coba lagi.", 502, "Could not reach the AI. Check your connection and try again.");
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return res;
      const detail = (await res.text()).replace(/\s+/g, " ").slice(0, 300);
      console.error(`[ai] Gemini ${model} menjawab ${res.status}: ${detail}`);
      if (res.status === 500 || res.status === 503) continue; // temporary: retry this model
      if (res.status === 429) {
        last = new AiError("Kuota AI habis untuk saat ini. Coba lagi beberapa menit lagi.", 429, "AI quota used up for now. Try again in a few minutes.");
        break; // this model's quota is used up: try the fallback model
      }
      if (res.status === 404) throw new AiError(`Model Gemini "${model}" tidak ditemukan. Periksa GEMINI_MODEL.`, 500, `Gemini model "${model}" not found. Check GEMINI_MODEL.`);
      if (res.status === 401 || res.status === 403) throw new AiError("Kunci API Gemini tidak valid. Periksa GEMINI_API_KEY.", 500, "Invalid Gemini API key. Check GEMINI_API_KEY.");
      // 400 covers both a malformed key and input the model cannot process (e.g. a broken image).
      if (res.status === 400) throw new AiError(/API key/i.test(detail) ? "Kunci API Gemini tidak valid. Periksa GEMINI_API_KEY." : "AI tidak bisa memproses kiriman ini. Coba foto ulang atau ubah pertanyaannya.", /API key/i.test(detail) ? 500 : 422, /API key/i.test(detail) ? "Invalid Gemini API key. Check GEMINI_API_KEY." : "The AI could not process this. Try another photo or rephrase the question.");
      throw new AiError("AI gagal menjawab. Coba lagi.", 502, "The AI failed to answer. Please try again.");
    }
  }
  throw last;
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
  if (!match) throw new AiError("Format foto tidak didukung. Pakai JPG atau PNG.", 400, "Photo format not supported. Use JPG or PNG.");
  const image = { mime: match[1]!, data: match[2]! };
  try {
    return aiProvider() === "claude" ? await claudeJson(prompt, image, schema, signal) : await geminiJson(prompt, image, signal);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("Jawaban AI tidak bisa dibaca. Coba foto ulang.", 502, "The AI answer could not be read. Try another photo.");
  }
}

/* ---------- Agent turns (tool calling) ---------- */
// One model turn of the FinTar agent loop. The loop itself lives in agent.server.ts; this
// file only translates between a provider-neutral history and Claude / Gemini requests.
// Assistant turns keep the provider's raw content (thinking blocks, Gemini thought
// signatures) so it can be sent back unchanged within the same run.

export type AgentToolSpec = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] } };
export type AgentCall = { id: string; name: string; input: unknown };
export type AgentMsg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls: AgentCall[]; raw: unknown }
  | { role: "tool"; results: { id: string; name: string; content: string; isError?: boolean }[] };
export type AgentReply = { text: string; calls: AgentCall[]; raw: unknown; refused: boolean };

async function claudeAgentTurn(system: string, history: AgentMsg[], tools: AgentToolSpec[], signal: AbortSignal): Promise<AgentReply> {
  const model = claudeModel();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.text }
      : m.role === "assistant"
        ? { role: "assistant", content: m.raw as Anthropic.Beta.BetaContentBlockParam[] }
        : { role: "user", content: m.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })) },
  );
  try {
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const res = await client.beta.messages.create(
      { model, max_tokens: 16000, system, messages, tools, ...claudeExtras(model, "medium") },
      { signal },
    );
    const calls = res.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : []));
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    // A refusal or a cut-off turn can carry an incomplete tool input; never run those calls.
    const unsafe = res.stop_reason === "refusal" || res.stop_reason === "max_tokens";
    return { text, calls: unsafe ? [] : calls, raw: res.content, refused: res.stop_reason === "refusal" };
  } catch (e) {
    throw claudeError(e);
  }
}

type GeminiPart = { text?: string; thought?: boolean; functionCall?: { id?: string; name: string; args?: unknown }; functionResponse?: unknown };

async function geminiAgentTurn(system: string, history: AgentMsg[], tools: AgentToolSpec[], signal: AbortSignal): Promise<AgentReply> {
  const contents = history.map((m) =>
    m.role === "user"
      ? { role: "user", parts: [{ text: m.text }] }
      : m.role === "assistant"
        ? { role: "model", parts: m.raw as GeminiPart[] }
        : { role: "user", parts: m.results.map((r) => ({ functionResponse: { name: r.name, ...(r.id.startsWith("g-") ? {} : { id: r.id }), response: { result: r.content, ...(r.isError ? { error: true } : {}) } } })) },
  );
  const res = await geminiFetch("generateContent", {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }],
    generationConfig: { temperature: 0.2 },
  }, signal);
  const body = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[] };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.flatMap((p, i) => (p.functionCall ? [{ id: p.functionCall.id ?? `g-${i}-${p.functionCall.name}`, name: p.functionCall.name, input: p.functionCall.args ?? {} }] : []));
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  const refused = body.candidates?.[0]?.finishReason === "SAFETY";
  return { text, calls: refused ? [] : calls, raw: parts, refused };
}

export function agentTurn(system: string, history: AgentMsg[], tools: AgentToolSpec[], signal: AbortSignal): Promise<AgentReply> {
  return aiProvider() === "claude" ? claudeAgentTurn(system, history, tools, signal) : geminiAgentTurn(system, history, tools, signal);
}
