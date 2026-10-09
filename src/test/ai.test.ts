import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiError, imageToJson, streamChat } from "@/lib/ai.server";

const IMAGE = "data:image/png;base64,AAAA";
const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const fail = (status: number) => new Response(JSON.stringify({ error: { code: status } }), { status });
const modelOf = (call: unknown[]) => /models\/([^:]+):/.exec(String(call[0]))![1];

describe("Gemini: coba ulang dan model cadangan", () => {
  const fetchMock = vi.fn<typeof fetch>();
  /** Runs a call to completion while skipping the waits between retries. */
  const settle = async <T>(p: Promise<T>) => {
    const done = p.then((value) => ({ value }), (error: unknown) => ({ error }));
    await vi.runAllTimersAsync();
    return done as Promise<{ value?: T; error?: unknown }>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "kunci-uji");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_PROVIDER", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("mencoba lagi saat Gemini menjawab 503 lalu berhasil", async () => {
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('{"total": 37000}'));

    const { value } = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect(value).toEqual({ total: 37000 });
    expect(fetchMock.mock.calls.map(modelOf)).toEqual(["gemini-flash-lite-latest", "gemini-flash-lite-latest"]);
  });

  it("pindah ke model cadangan bila model utama terus sibuk", async () => {
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('{"total": 1}'));

    const { value } = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect(value).toEqual({ total: 1 });
    expect(fetchMock.mock.calls.map(modelOf)).toEqual(["gemini-flash-lite-latest", "gemini-flash-lite-latest", "gemini-flash-lite-latest", "gemini-flash-latest"]);
  });

  it("langsung pindah model bila kuota model utama habis", async () => {
    fetchMock.mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('{"total": 2}'));

    const { value } = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect(value).toEqual({ total: 2 });
    expect(fetchMock.mock.calls.map(modelOf)).toEqual(["gemini-flash-lite-latest", "gemini-flash-latest"]);
  });

  it("memberi pesan yang jelas bila semua percobaan gagal", async () => {
    fetchMock.mockImplementation(async () => fail(503));

    const { error } = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).message).toBe("AI sedang sangat ramai. Coba lagi sebentar.");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("tidak mencoba ulang bila kuncinya salah", async () => {
    fetchMock.mockResolvedValueOnce(fail(403));

    const { error } = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect((error as AiError).message).toMatch(/Kunci API Gemini tidak valid/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("membedakan foto yang tidak bisa diproses dari kunci yang salah", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"code":400,"message":"Unable to process input image."}}', { status: 400 }));
    const image = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key."}}', { status: 400 }));
    const key = await settle(imageToJson("baca", IMAGE, {}, new AbortController().signal));

    expect((image.error as AiError).message).toMatch(/tidak bisa memproses kiriman/);
    expect((key.error as AiError).message).toMatch(/Kunci API Gemini tidak valid/);
  });

  it("chat juga mencoba ulang sebelum mulai mengalirkan jawaban", async () => {
    const sse = new Response('data: {"candidates":[{"content":{"parts":[{"text":"Halo"}]}}]}\n\ndata: {"candidates":[{"content":{"parts":[{"text":" kak"}]}}]}\n\n', { status: 200 });
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(sse);
    const collect = async () => {
      let text = "";
      for await (const chunk of streamChat("sistem", [{ role: "user", text: "hai" }], new AbortController().signal)) text += chunk;
      return text;
    };

    const { value } = await settle(collect());

    expect(value).toBe("Halo kak");
  });
});
