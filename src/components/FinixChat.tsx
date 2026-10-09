import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RotateCcw, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/cloud";
import { logActivity, rollingDays, rp, summarize, updateProfile, useLedger, usePlanned, useProfile } from "@/lib/financials";
import { useTranslation } from "@/lib/i18n";
import finixMark from "@/assets/finix-mark.png";

const STORAGE_KEY = "fintar-finix-chat";
const TARGETS = [10, 20, 30];

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export function FinixChat({ prompt, onPromptUsed }: { prompt?: string | null; onPromptUsed?: () => void }) {
  const initial = useMemo(loadMessages, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const { t, lang } = useTranslation();
  const dataRef = useRef({ ledger, profile, planned });
  dataRef.current = { ledger, profile, planned };
  const [picking, setPicking] = useState(false);
  const [demo, setDemo] = useState(false);
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: "finix",
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat", body: () => dataRef.current, headers: authHeaders }),
    onError: (e) => toast.error(e.message || (lang === "en" ? "Finix failed to answer. Please try again." : "Finix gagal menjawab. Coba lagi.")),
  });
  const busy = status === "submitted" || status === "streaming";

  const suggestions = [t("sug1"), t("sug2"), t("sug3")];

  useEffect(() => {
    if (status === "ready" || status === "error") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      textareaRef.current?.focus();
    }
  }, [messages, status]);

  const ask = (text: string) => {
    logActivity({ tool: "ask_finix", tier: "T0", status: "completed", summary: `Bertanya ke Finix: "${text.slice(0, 80)}"` });
    sendMessage({ text });
  };
  const send = (text: string) => {
    const textStr = text.trim();
    if (!textStr || busy) return;
    ask(textStr);
  };

  // A prompt handed over from another screen (e.g. "Tanya Finix" on a report) is sent once.
  const sentPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt || sentPrompt.current === prompt) return;
    sentPrompt.current = prompt;
    ask(prompt);
    onPromptUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ask` only wraps the stable sendMessage
  }, [prompt, onPromptUsed]);

  useEffect(() => {
    fetch("/api/chat").then((r) => r.json()).then((d: { ai?: boolean }) => setDemo(!d.ai)).catch(() => {});
  }, []);

  const revenue30 = summarize(rollingDays(ledger, 0, 30)).revenue;
  const setTarget = (pct: number) => {
    setPicking(false);
    if (revenue30 > 0) {
      const amount = Math.round(revenue30 * (1 + pct / 100));
      updateProfile({ target: { pct, amount } });
      logActivity({ tool: "set_target", tier: "T1", status: "approved", summary: `Target omzet dipasang: naik ${pct}% menjadi ${rp(amount)}` });
    }
    send(lang === "en" ? `I want next month's revenue to grow by ${pct}%. Help me create an actionable plan.` : `Aku mau omzet bulan depan naik ${pct}%. Bantu buat rencananya.`);
  };

  const reset = () => {
    stop();
    setMessages([]);
    window.localStorage.removeItem(STORAGE_KEY);
    textareaRef.current?.focus();
  };

  const last = messages[messages.length - 1];
  const waiting = busy && (last?.role === "user" || !last?.parts.some((p) => p.type === "text" && p.text));

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col pb-2">
      <header className="flex items-center gap-3 border-b border-border px-5 pb-4 pt-6">
        <img src={finixMark} alt="Finix" width={44} height={44} className="size-11 rounded-2xl bg-muted object-contain p-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">Finix</h1>
          <p className="truncate text-xs text-muted-foreground"><span className="text-success">●</span> {t("finixOnline", { name: profile.name })}{demo ? ` • ${t("finixDemoMode")}` : ""}</p>
        </div>
        {messages.length > 0 && (
          <Button variant="icon" size="icon" className="rounded-full" onClick={reset} aria-label={t("startNewChatAria")}><RotateCcw size={16} /></Button>
        )}
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-5 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-6 text-center">
              <img src={finixMark} alt="" width={96} height={96} className="size-24 object-contain" />
              <h2 className="mt-3 text-lg font-extrabold">{t("helloFinix")}</h2>
              <p className="mt-1 max-w-64 text-sm text-muted-foreground">{t("finixIntroText")}</p>
              {demo && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">{t("finixDemoNotice")}</p>}
              <div className="mt-6 flex w-full flex-col gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary hover:text-primary">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === "user" ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground rounded-2xl" : "bg-transparent p-0"}>
                {m.parts.map((part, i) =>
                  part.type === "text" ? (
                    m.role === "assistant" ? <MessageResponse key={i}>{part.text}</MessageResponse> : <p key={i} className="whitespace-pre-wrap">{part.text}</p>
                  ) : null,
                )}
              </MessageContent>
            </Message>
          ))}
          {waiting && <div className="text-sm"><Shimmer>{t("finixAnalyzing")}</Shimmer></div>}
          {error && !busy && <p className="text-xs text-danger">{error.message || (lang === "en" ? "An error occurred." : "Terjadi kesalahan.")}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          {picking ? (
            <>
              <span className="shrink-0 text-[11px] font-bold text-muted-foreground">{t("howMuchIncrease")}</span>
              {TARGETS.map((targetPct) => (
                <button key={targetPct} disabled={busy} onClick={() => setTarget(targetPct)} className="shrink-0 rounded-full border border-primary px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">{targetPct}%{revenue30 > 0 ? ` · ${rp(revenue30 * (1 + targetPct / 100))}` : ""}</button>
              ))}
              <button onClick={() => setPicking(false)} className="shrink-0 px-2 text-xs text-muted-foreground">{t("cancel")}</button>
            </>
          ) : (
            <>
              <button onClick={() => setPicking(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Target size={13} /> {t("setTargetBtn")}</button>
              {messages.length > 0 && suggestions.map((s) => (
                <button key={s} disabled={busy} onClick={() => send(s)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-50">{s}</button>
              ))}
            </>
          )}
        </div>
        <PromptInput onSubmit={({ text }) => send(text)}>
          <PromptInputTextarea ref={textareaRef} autoFocus placeholder={t("askFinixPlaceholder")} />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}
