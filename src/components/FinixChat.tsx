import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import finixMark from "@/assets/finix-mark.png";

const STORAGE_KEY = "fintar-finix-chat";
const SUGGESTIONS = [
  "Gimana kondisi keuanganku bulan ini?",
  "Berapa stok tepung yang perlu ditambah untuk Ramadan?",
  "Biaya mana yang bisa aku hemat?",
];

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export function FinixChat() {
  const initial = useMemo(loadMessages, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: "finix",
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (e) => toast.error(e.message || "Finix gagal menjawab. Coba lagi."),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (status === "ready" || status === "error") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      textareaRef.current?.focus();
    }
  }, [messages, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
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
    <main className="flex h-[100dvh] flex-col pb-20 sm:h-[880px]">
      <header className="flex items-center gap-3 border-b border-border px-5 pb-4 pt-6">
        <img src={finixMark} alt="Finix" width={44} height={44} className="size-11 rounded-2xl bg-muted object-contain p-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">Finix</h1>
          <p className="text-xs text-muted-foreground"><span className="text-success">●</span> Asisten keuangan Viera Bakery</p>
        </div>
        {messages.length > 0 && (
          <Button variant="icon" size="icon" className="rounded-full" onClick={reset} aria-label="Mulai obrolan baru"><RotateCcw size={16} /></Button>
        )}
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-5 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-6 text-center">
              <img src={finixMark} alt="" width={96} height={96} className="size-24 object-contain" />
              <h2 className="mt-3 text-lg font-extrabold">Halo, aku Finix!</h2>
              <p className="mt-1 max-w-64 text-sm text-muted-foreground">Tanya apa saja soal laporan, arus kas, atau strategi usahamu.</p>
              <div className="mt-6 flex w-full flex-col gap-2">
                {SUGGESTIONS.map((s) => (
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
          {waiting && <div className="text-sm"><Shimmer>Finix sedang menganalisis...</Shimmer></div>}
          {error && !busy && <p className="text-xs text-danger">{error.message || "Terjadi kesalahan."}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-3 pt-2">
        <PromptInput onSubmit={({ text }) => send(text)}>
          <PromptInputTextarea ref={textareaRef} autoFocus placeholder="Tanya Finix..." />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  );
}
