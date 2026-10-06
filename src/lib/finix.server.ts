import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { FINANCIAL_CONTEXT } from "./financials";

const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

function createRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolved = false;
  let resolveRunId: (v: string | undefined) => void = () => {};
  const ready = new Promise<string | undefined>((r) => (resolveRunId = r));
  const publish = (value?: string) => {
    if (!runId && value?.trim()) runId = value.trim();
    if (!resolved) {
      resolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publish(runId);
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
      try {
        const res = await fetch(input, { ...init, headers });
        publish(res.headers.get(RUN_ID_HEADER) ?? undefined);
        return res;
      } catch (e) {
        publish(undefined);
        throw e;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : ready),
  };
}

const SYSTEM = `Kamu adalah Finix, asisten keuangan AI di aplikasi FinTar untuk UMKM. Kamu membantu pemilik Viera Bakery memahami kondisi keuangannya.
Jawab dalam Bahasa Indonesia yang santai tapi profesional, ringkas (maksimal ~150 kata kecuali diminta detail), gunakan markdown (poin, tebal) bila membantu. Gunakan format Rupiah seperti Rp1.100.000.
Gunakan data keuangan berikut sebagai sumber utama. Jika data tidak tersedia, katakan terus terang dan beri saran umum.

${FINANCIAL_CONTEXT}`;

export async function handleFinixChat(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return Response.json({ error: "AI belum dikonfigurasi." }, { status: 500 });

  let messages: UIMessage[];
  try {
    const body = (await request.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages)) throw new Error("invalid");
    messages = body.messages as UIMessage[];
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const runIdFetch = createRunIdFetch(request.headers.get(RUN_ID_HEADER) ?? undefined);
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: SYSTEM,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onError: (error) => {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 429) return "Finix sedang sibuk. Coba lagi sebentar lagi.";
      if (status === 402) return "Kuota AI habis. Tambahkan kredit di pengaturan workspace.";
      if (status === 403) return "Akses AI ditolak untuk permintaan ini.";
      return "Finix gagal menjawab. Coba lagi.";
    },
  });

  if (!response.body) return response;
  const reader = response.body.getReader();
  const first = reader.read();
  const runId = await runIdFetch.waitForRunId();
  const headers = new Headers(response.headers);
  if (runId) {
    headers.set(RUN_ID_HEADER, runId);
    headers.set("Access-Control-Expose-Headers", RUN_ID_HEADER);
  }
  const body = new ReadableStream({
    async start(controller) {
      try {
        const f = await first;
        if (f.done) return controller.close();
        controller.enqueue(f.value);
        while (true) {
          const c = await reader.read();
          if (c.done) break;
          controller.enqueue(c.value);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel: (r) => reader.cancel(r),
  });
  return new Response(body, { status: response.status, headers });
}
