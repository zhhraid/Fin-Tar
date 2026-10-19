import { runTool, toolTitle, type Lang, type Proposal, type Snapshot, type ToolOutcome } from "./tools";
import type { AgentStep, Emit } from "./types";

// Runs tools for one agent run and reports each call to the app. Shared by the model-driven
// agent and the rule-based one, so both follow the same limits:
const MAX_TOOL_CALLS = 12;
const MAX_PROPOSALS = 3;

export type Executor = ReturnType<typeof createExecutor>;

export function createExecutor(snap: Snapshot, lang: Lang, emit: Emit) {
  let calls = 0;
  const proposals: Proposal[] = [];
  const steps: AgentStep[] = [];

  function call(name: string, input: unknown = {}): { ok: true; outcome: ToolOutcome } | { ok: false; error: string } {
    const id = `s${steps.length + 1}`;
    const title = toolTitle(name, lang);
    if (++calls > MAX_TOOL_CALLS) {
      const error = lang === "en" ? "Step limit reached for this request" : "Batas langkah untuk permintaan ini tercapai";
      push({ id, tool: name, title, tier: "T0", status: "blocked", summary: error });
      return { ok: false, error };
    }
    const res = runTool(name, input, snap, lang);
    if (!res.ok) {
      push({ id, tool: name, title, tier: res.tier, status: res.tier === "T3" ? "blocked" : "error", summary: res.error });
      return { ok: false, error: res.error };
    }
    const { outcome } = res;
    if (outcome.proposal && proposals.length >= MAX_PROPOSALS) {
      const error = lang === "en" ? "Too many proposals in one request" : "Terlalu banyak usulan dalam satu permintaan";
      push({ id, tool: name, title, tier: res.tier, status: "blocked", summary: error });
      return { ok: false, error };
    }
    push({ id, tool: name, title, tier: res.tier, status: "done", summary: outcome.summary, ...(outcome.sources?.length ? { sources: outcome.sources.length } : {}) });
    for (const m of outcome.metrics ?? []) emit({ type: "metric", metric: m });
    if (outcome.proposal) {
      proposals.push(outcome.proposal);
      emit({ type: "proposal", proposal: outcome.proposal });
    }
    return { ok: true, outcome };
  }

  function push(step: AgentStep) {
    steps.push(step);
    emit({ type: "step", step });
  }

  return { call, steps, proposals };
}
