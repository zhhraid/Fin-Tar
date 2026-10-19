import type { ForbiddenKind } from "../guardrails";
import type { Lang, Metric, Proposal, Tier } from "./tools";

export type Intent = "cash_health" | "cost_analysis" | "financing" | "record_transaction" | "overview" | "general" | "forbidden";

export const intentLabels: Record<Intent, Record<Lang, string>> = {
  cash_health: { en: "Cash health check", id: "Cek kesehatan kas" },
  cost_analysis: { en: "Cost analysis", id: "Analisis biaya" },
  financing: { en: "Financing match", id: "Cari pembiayaan" },
  record_transaction: { en: "Record a transaction", id: "Catat transaksi" },
  overview: { en: "Business overview", id: "Ringkasan usaha" },
  general: { en: "General question", id: "Pertanyaan umum" },
  forbidden: { en: "Forbidden action (T3)", id: "Tindakan terlarang (T3)" },
};

/** One tool call as shown in the trace. */
export type AgentStep = { id: string; tool: string; title: string; tier: Tier | "T3"; status: "done" | "error" | "blocked"; summary: string; sources?: number };

/** Streamed to the app as newline-delimited JSON, one event per line. */
export type AgentEvent =
  | { type: "intent"; intent: Intent; label: string }
  | { type: "plan"; steps: string[] }
  | { type: "step"; step: AgentStep }
  | { type: "metric"; metric: Metric }
  | { type: "proposal"; proposal: Proposal }
  | { type: "answer"; text: string }
  | { type: "notice"; text: string }
  | { type: "done"; mode: "claude" | "gemini" | "rules"; blocked?: ForbiddenKind }
  | { type: "error"; message: string };

export type Emit = (e: AgentEvent) => void;
