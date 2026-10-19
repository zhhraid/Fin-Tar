import { ArrowUp, Ban, CheckCircle2, CircleAlert, ListChecks, Loader2, RotateCcw, ShieldCheck, Sparkles, Target, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/cloud";
import { addPlanned, addTransaction, dateInputToIso, logActivity, submitLoan, updatePlanned, useActivity, useLedger, useLoanApplication, usePlanned, useProfile } from "@/lib/financials";
import { forbiddenRequest } from "@/lib/guardrails";
import { useTranslation } from "@/lib/i18n";
import { requestPin } from "@/lib/pin";
import type { Metric, Proposal } from "@/lib/agent/tools";
import type { AgentEvent, AgentStep, Intent } from "@/lib/agent/types";
import finixMark from "@/assets/finix-mark.png";

// Finix, the FinTar finance agent. Each question is one agent run, streamed from
// /api/agent: intent -> plan -> tool calls (with tier) -> measured impact -> answer ->
// proposals. Proposals change nothing until the user approves them here; large amounts and
// financing applications also need the PIN. Every run and decision goes to the activity log.

const STORAGE_KEY = "fintar-agent-runs-v1";
const HIGH_VALUE = 10_000_000; // approvals at or above this amount also ask for the PIN

type Decision = "pending" | "approved" | "rejected";
type Run = {
  id: string;
  question: string;
  intent?: { intent: Intent; label: string };
  plan: string[];
  steps: AgentStep[];
  metrics: Metric[];
  proposals: (Proposal & { decision: Decision })[];
  answer: string;
  notice?: string;
  mode?: "claude" | "gemini" | "rules";
  error?: string;
  busy: boolean;
};

function loadRuns(): Run[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Run[]).map((r) => ({ ...r, busy: false })) : [];
  } catch {
    return [];
  }
}

export function FinixChat({ prompt, onPromptUsed }: { prompt?: string | null; onPromptUsed?: () => void }) {
  const [runs, setRuns] = useState<Run[]>(loadRuns);
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const loan = useLoanApplication();
  const activity = useActivity();
  const { lang } = useTranslation();
  const L = (en: string, id: string) => (lang === "en" ? en : id);
  const dataRef = useRef({ ledger, profile, planned, lang });
  dataRef.current = { ledger, profile, planned, lang };
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = runs.some((r) => r.busy);

  useEffect(() => {
    if (busy) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(-20)));
    } catch {
      /* storage unavailable */
    }
  }, [runs, busy]);
  useEffect(() => bottomRef.current?.scrollIntoView?.({ block: "end" }), [runs]);
  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((d: { provider?: string }) => setProvider(d.provider ?? null)).catch(() => {});
  }, []);

  const patch = (id: string, fn: (r: Run) => Run) => setRuns((all) => all.map((r) => (r.id === id ? fn(r) : r)));

  const apply = (id: string, e: AgentEvent) =>
    patch(id, (r) => {
      switch (e.type) {
        case "intent": return { ...r, intent: { intent: e.intent, label: e.label } };
        case "plan": return { ...r, plan: e.steps };
        case "step": return { ...r, steps: [...r.steps, e.step] };
        case "metric": return { ...r, metrics: [...r.metrics.filter((m) => m.key !== e.metric.key), e.metric] };
        case "proposal": return { ...r, proposals: [...r.proposals, { ...e.proposal, decision: "pending" as const }] };
        case "answer": return { ...r, answer: e.text };
        case "notice": return { ...r, notice: e.text };
        case "done": return { ...r, mode: e.mode };
        case "error": return { ...r, error: e.message };
      }
    });

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    const id = `r${Date.now().toString(36)}`;
    const history = runs.slice(-4).flatMap((r) => (r.answer ? [{ role: "user", text: r.question }, { role: "assistant", text: r.answer }] : []));
    setRuns((all) => [...all, { id, question: q, plan: [], steps: [], metrics: [], proposals: [], answer: "", busy: true }]);
    const final: { intent?: Intent; label?: string; tools: string[]; metrics: Record<string, number>; mode?: string; blocked?: string } = { tools: [], metrics: {} };
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ question: q, history, ...dataRef.current }) });
      if (!res.ok || !res.body) {
        const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        throw new Error(msg || L("The agent could not start. Please try again.", "Agen tidak bisa mulai. Coba lagi."));
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as AgentEvent;
          if (e.type === "intent") Object.assign(final, { intent: e.intent, label: e.label });
          if (e.type === "step") final.tools.push(`${e.step.tool}:${e.step.tier}:${e.step.status}`);
          if (e.type === "metric") final.metrics[e.metric.key] = e.metric.raw;
          if (e.type === "done") Object.assign(final, { mode: e.mode, blocked: e.blocked });
          apply(id, e);
        }
      }
    } catch (err) {
      patch(id, (r) => ({ ...r, error: err instanceof Error ? err.message : String(err) }));
    }
    patch(id, (r) => ({ ...r, busy: false }));
    // One log entry per run; T3 attempts are logged as blocked.
    if (final.blocked || forbiddenRequest(q)) logActivity({ tool: `finix_${final.blocked ?? forbiddenRequest(q)}`, tier: "T3", status: "blocked", summary: L(`Forbidden request refused: "${q.slice(0, 80)}"`, `Permintaan terlarang ditolak: "${q.slice(0, 80)}"`) });
    else if (final.intent) logActivity({ tool: "agent_run", tier: final.tools.some((t) => t.includes(":T1:")) ? "T1" : "T0", status: "completed", summary: L(`Agent (${final.label}): ${final.tools.length} steps`, `Agen (${final.label}): ${final.tools.length} langkah`), detail: { question: q.slice(0, 200), intent: final.intent, steps: final.tools, metrics: final.metrics, mode: final.mode } });
  }

  async function decide(runId: string, p: Run["proposals"][number], approve: boolean) {
    const mark = (decision: Decision) => patch(runId, (r) => ({ ...r, proposals: r.proposals.map((x) => (x.id === p.id ? { ...x, decision } : x)) }));
    if (!approve) {
      mark("rejected");
      logActivity({ tool: `agent_${p.kind}`, tier: "T2", status: "rejected", summary: L(`Rejected: ${p.title}`, `Ditolak: ${p.title}`) });
      return;
    }
    // Checked again against the data as it is now, not as it was when the agent ran.
    if (p.kind === "add_transaction") {
      if (p.tx.amount >= HIGH_VALUE && !(await requestPin(L("Enter your PIN to approve a high-value transaction.", "Masukkan PIN untuk menyetujui transaksi bernilai besar.")))) return;
      addTransaction({ title: p.tx.title, amount: p.tx.amount, type: p.tx.type, category: p.tx.category, source: "manual", date: dateInputToIso(p.tx.date) });
    } else if (p.kind === "reschedule_payment") {
      const item = planned.find((x) => x.id === p.plannedId && !x.done);
      if (!item) return void toast.error(L("That bill no longer exists or is already paid.", "Tagihan itu sudah tidak ada atau sudah lunas."));
      updatePlanned(item.id, { due: p.to });
    } else if (p.kind === "add_reminder") {
      addPlanned(p.item);
    } else if (p.kind === "financing_application") {
      if (loan) return void toast.error(L("You already have an application in progress.", "Kamu sudah punya pengajuan yang berjalan."));
      if (!(await requestPin(L("Enter your PIN to send the (simulated) financing application.", "Masukkan PIN untuk mengirim pengajuan pembiayaan (simulasi).")))) return;
      submitLoan(p.application); // logs the sandbox submission itself
    }
    mark("approved");
    if (p.kind !== "financing_application") logActivity({ tool: `agent_${p.kind}`, tier: "T2", status: "approved", summary: L(`Approved: ${p.title}`, `Disetujui: ${p.title}`), detail: { kind: p.kind, ...(p.kind === "reschedule_payment" && p.impact ? { impact: p.impact.raw } : {}) } });
    toast.success(L("Done. Recorded in the activity log.", "Selesai. Tercatat di log aktivitas."));
  }

  // Measurable value across runs, from the activity log.
  const impact = useMemo(() => {
    const agentRuns = activity.filter((a) => a.tool === "agent_run");
    const last = agentRuns[0]?.detail?.["metrics"] as Record<string, number> | undefined;
    const approved = activity.filter((a) => (a.tool.startsWith("agent_") && a.tool !== "agent_run" && a.status === "approved") || (a.tool === "submit_proposal_sandbox")).length;
    const decided = activity.filter((a) => a.tool.startsWith("agent_") && a.tool !== "agent_run" && a.tier === "T2").length;
    const gained = activity.filter((a) => a.tool === "agent_reschedule_payment" && a.status === "approved").reduce((s, a) => s + (Number(a.detail?.["impact"]) || 0), 0);
    const blocked = activity.filter((a) => a.tier === "T3").length;
    return { runs: agentRuns.length, approved, decided, gained, blocked, savings: last?.["savings_month"], runway: last?.["runway_days"] };
  }, [activity]);

  const sentPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt || sentPrompt.current === prompt) return;
    sentPrompt.current = prompt;
    void ask(prompt);
    onPromptUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a handed-over prompt is sent once
  }, [prompt, onPromptUsed]);

  const suggestions = lang === "en"
    ? ["Is my cash safe for the next 30 days?", "Where can I cut costs?", "I need Rp5 million for stock. What are my options?", "Record: sold 30 breads Rp450,000"]
    : ["Kasku aman untuk 30 hari ke depan?", "Biaya mana yang bisa dihemat?", "Aku butuh modal Rp5 juta untuk stok, opsinya apa?", "Catat: jual 30 roti Rp450.000"];
  const modeLabel = provider === "claude" ? "Claude" : provider === "gemini" ? "Gemini" : L("built-in rules (demo)", "aturan bawaan (demo)");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col pb-2">
      <header className="flex items-center gap-3 border-b border-border px-5 pb-3 pt-6">
        <img src={finixMark} alt="Finix" width={44} height={44} className="size-11 rounded-2xl bg-muted object-contain p-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight">Finix <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary">{L("AI AGENT", "AGEN AI")}</span></h1>
          <p className="truncate text-xs text-muted-foreground"><span className="text-success">●</span> {L(`Finance agent for ${profile.name}`, `Agen keuangan ${profile.name}`)} · {modeLabel}</p>
        </div>
        {runs.length > 0 && <Button variant="icon" size="icon" className="rounded-full" onClick={() => setRuns([])} disabled={busy} aria-label={L("Start over", "Mulai ulang")}><RotateCcw size={16} /></Button>}
      </header>

      {/* Measurable value */}
      <section aria-label={L("Agent impact", "Dampak agen")} className="grid grid-cols-4 gap-1.5 border-b border-border px-4 py-2.5 text-center">
        <ImpactTile label={L("Runs", "Tugas")} value={String(impact.runs)} />
        <ImpactTile label={L("Approved", "Disetujui")} value={`${impact.approved}${impact.decided ? `/${impact.decided}` : ""}`} />
        <ImpactTile label={L("Runway", "Kas aman")} value={impact.runway === undefined ? "–" : `${impact.runway > 30 ? "30+" : impact.runway} d${impact.gained > 0 ? ` +${impact.gained}` : ""}`} tone={impact.runway !== undefined && impact.runway + impact.gained <= 14 ? "bad" : "good"} />
        <ImpactTile label={L("Blocked (T3)", "Diblokir (T3)")} value={String(impact.blocked)} />
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 app-scroll">
        {runs.length === 0 && (
          <div className="flex flex-col items-center pt-2 text-center">
            <img src={finixMark} alt="" width={80} height={80} className="size-20 object-contain" />
            <h2 className="mt-2 text-lg font-extrabold">{L("Hi, I'm Finix, your finance agent", "Halo, aku Finix, agen keuanganmu")}</h2>
            <p className="mt-1 max-w-72 text-xs leading-relaxed text-muted-foreground">{L("Give me a task. I'll understand it, plan the steps, run the tools on your records, and propose actions that only happen after you approve.", "Beri aku tugas. Aku pahami, susun langkahnya, jalankan alat pada catatanmu, lalu usulkan tindakan yang baru berjalan setelah kamu setujui.")}</p>
            <div className="mt-5 flex w-full flex-col gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => void ask(s)} className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary hover:text-primary">{s}</button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {runs.map((r) => (
            <article key={r.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">{r.question}</p>
              <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5">
                {r.intent && (
                  <p className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${r.intent.intent === "forbidden" ? "bg-danger-soft text-danger" : "bg-primary/10 text-primary"}`}>
                    <Target size={12} /> {L("Intent", "Niat")}: {r.intent.label}
                  </p>
                )}
                {r.plan.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><ListChecks size={12} /> {L("Plan", "Rencana")}</p>
                    <ol className="space-y-0.5 text-xs">{r.plan.map((s, i) => <li key={i} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span>{s}</span></li>)}</ol>
                  </div>
                )}
                {r.steps.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><ShieldCheck size={12} /> {L("Execution", "Eksekusi")}</p>
                    <ul className="space-y-1">
                      {r.steps.map((s) => (
                        <li key={s.id} className="flex items-start gap-2 text-xs">
                          {s.status === "done" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" /> : s.status === "blocked" ? <Ban size={14} className="mt-0.5 shrink-0 text-danger" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />}
                          <span className="min-w-0 flex-1"><span className="font-semibold">{s.title}</span> <span className="text-muted-foreground">· {s.summary}{s.sources ? ` · ${L(`${s.sources} source transactions`, `${s.sources} transaksi sumber`)}` : ""}</span></span>
                          <span className={`shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-bold ${s.tier === "T3" ? "bg-danger-soft text-danger" : s.tier === "T2" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>{s.tier}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.metrics.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {r.metrics.map((m) => (
                      <div key={m.key} className="rounded-xl bg-muted px-2.5 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        <p className={`text-sm font-extrabold ${m.good === false ? "text-danger" : m.good ? "text-success" : ""}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {r.notice && <p className="rounded-xl bg-muted px-3 py-2 text-[11px] text-muted-foreground">{r.notice}</p>}
                {r.answer && <div className="text-sm leading-relaxed"><MessageResponse>{r.answer}</MessageResponse></div>}
                {r.proposals.map((p) => (
                  <div key={p.id} className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary"><Sparkles size={12} /> {L("Proposed action · T2 · needs your approval", "Usulan tindakan · T2 · perlu persetujuanmu")}</p>
                    <p className="mt-1 text-sm font-bold">{p.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.why}</p>
                    {p.decision === "pending" ? (
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        <Button variant="secondary" className="h-9 text-xs" onClick={() => void decide(r.id, p, false)} aria-label={L(`Reject: ${p.title}`, `Tolak: ${p.title}`)}><X size={14} /> {L("Reject", "Tolak")}</Button>
                        <Button className="h-9 text-xs" onClick={() => void decide(r.id, p, true)} aria-label={L(`Approve: ${p.title}`, `Setujui: ${p.title}`)}><CheckCircle2 size={14} /> {L("Approve", "Setujui")}</Button>
                      </div>
                    ) : (
                      <p className={`mt-2 text-xs font-bold ${p.decision === "approved" ? "text-success" : "text-muted-foreground"}`}>{p.decision === "approved" ? L("✓ Approved and done", "✓ Disetujui dan dijalankan") : L("✕ Rejected, nothing changed", "✕ Ditolak, tidak ada yang berubah")}</p>
                    )}
                  </div>
                ))}
                {r.busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> {L("Working…", "Sedang bekerja…")}</p>}
                {r.error && <p className="text-xs font-semibold text-danger">{r.error}</p>}
                {r.mode && !r.busy && <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><TrendingUp size={11} /> {r.mode === "rules" ? L("Built-in agent (rules)", "Agen bawaan (aturan)") : `${L("Model", "Model")}: ${r.mode === "claude" ? "Claude" : "Gemini"}`}</p>}
              </div>
            </article>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 px-4 pb-3 pt-2">
        <textarea
          aria-label={L("Give Finix a task", "Beri Finix tugas")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(text);
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={L("Give Finix a task…", "Beri Finix tugas…")}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-card px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button type="submit" className="size-11 shrink-0 rounded-2xl p-0" disabled={busy || !text.trim()} aria-label={L("Send", "Kirim")}>{busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}</Button>
      </form>
    </main>
  );
}

function ImpactTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className={`text-sm font-extrabold tabular-nums ${tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : ""}`}>{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
