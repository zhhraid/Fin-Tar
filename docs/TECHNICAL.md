# FinTar: Technical Documentation

**FinTar** is an AI finance agent for micro and small business owners (Indonesian UMKM). Track: 2026 FinTechathon International Track, **Topic E: SME Finance Copilot**. Its agent, **Finix**, completes real financial tasks on the owner's own records: it understands the request, plans steps, runs permission-tiered tools, proposes actions that only happen after the user approves, and reports the measurable impact.

Live app: <https://fin-tar-seven.vercel.app> · Source: <https://github.com/zhhraid/Fin-Tar>

## 1. What the agent does

| Capability | How FinTar implements it | Where |
|---|---|---|
| Intent understanding | The model calls `plan_task` first and names one of six intents (`cash_health`, `cost_analysis`, `financing`, `record_transaction`, `overview`, `general`). Without a model, a bilingual (EN/ID) rule classifier does the same. Tier-3 requests are recognised before anything runs. | `src/lib/agent/tools.ts`, `src/lib/agent/rules.ts`, `src/lib/guardrails.ts` |
| Task planning | The plan (ordered steps) is shown to the user before the tool calls; the model then chooses and chains tools, using each result to decide the next step (up to 8 turns). | `src/lib/agent.server.ts` |
| Safe execution | 11 tools in three tiers. T0/T1 run automatically on the user's own data. T2 tools never execute on the server: they return a proposal. T3 is refused. Every input is validated (zod); hard limits per run. | `src/lib/agent/tools.ts`, `src/lib/agent/execute.ts` |
| User control | Approve / Reject card for every T2 proposal; PIN for high-value transactions and financing applications; every run, approval, rejection and refusal goes to a hash-chained activity log the user can download. | `src/components/FinixChat.tsx`, `src/lib/pin.ts`, `supabase/migrations/20261016000000_audit_chain.sql` |
| Measurable value | Every tool reports checkable metrics (cash runway in days, lowest projected balance, potential monthly savings, installment as share of profit, runway days gained by an action). An impact panel tracks runs, approvals, runway and blocked attempts. A 10-scenario evaluation measures task completion. | `src/lib/agent/tools.ts`, `docs/evidence/agent-scenarios.md` |

## 2. System architecture

```
 Phone / browser (React PWA, one route)                 Server (TanStack Start on Node / Vercel)
 ┌──────────────────────────────────────────┐            ┌──────────────────────────────────────────────┐
 │ Ledger, profile, bills (stores)          │  POST      │ /api/agent  (agent.server.ts)                 │
 │   device mode: localStorage              │ /api/agent │  1. guard: origin, size, rate limit           │
 │   account mode: Supabase (RLS)           ├───────────►│  2. login + AI consent (account mode)         │
 │                                          │  snapshot  │  3. Tier-3 refusal (guardrails.ts)            │
 │ Finix agent screen (FinixChat.tsx)       │  + question│  4. agent loop ──► ai.server.ts ──► Claude /  │
 │   intent · plan · trace · metrics        │◄───────────┤       │            (tool calling)     Gemini   │
 │   proposals: Approve / Reject (+ PIN)    │  NDJSON    │       └─► tools.ts (T0/T1 run, T2 propose)    │
 │   executes approved T2 actions locally   │  events    │     no key / provider error ─► rules.ts agent │
 │   activity log (hash-chained on server)  │            └──────────────────────────────────────────────┘
 └──────────────────────────────────────────┘
          │ account mode                                   Supabase Postgres: 7 tables, Row Level Security
          └─────────────────────────────────────────────►  agent_actions: SHA-256 hash chain, append-only
```

- **Frontend:** React 19, TanStack Start/Router, Tailwind CSS, shadcn/ui. Mobile-first PWA; UI in English or Indonesian (follows the browser).
- **Backend:** TanStack Start server routes (`/api/agent`, `/api/scan`, `/api/chat`), deployable to Vercel, Netlify or any Node host.
- **AI:** Claude (`claude-opus-5-5` by default, Anthropic SDK, tool use, server-side refusal fallback) or Gemini (REST function calling). All model calls go through `src/lib/ai.server.ts`; keys stay on the server.
- **Data:** Supabase (PostgreSQL + Auth) when configured; otherwise device mode (data stays in the browser). Schema: `supabase/migrations/`.

### Agent run, step by step

1. The app sends the question, the last few turns, the language and a **snapshot of the user's own records**. Tools only ever see this snapshot, so a tool cannot reach another account's data.
2. `guardAiRequest` rejects cross-site calls, oversized bodies (>2 MB) and clients over budget (20/min, 300/day per IP by default). In account mode `authorizeAi` checks the Supabase session and the latest AI-processing consent.
3. `forbiddenRequest` refuses Tier-3 requests with fixed text, without calling any model or tool.
4. **Model loop** (`runModelAgent`): send system prompt + history + tool specs → the model returns text and/or tool calls → each call is validated and executed by the executor → results go back as tool results → repeat until the model answers (max 8 turns, 12 tool calls, 3 proposals).
5. Every step is streamed to the app as newline-delimited JSON (`intent`, `plan`, `step`, `metric`, `proposal`, `answer`, `done`).
6. **Fallback:** with no AI key, or if the provider fails mid-run, the rule-based agent (`rules.ts`) completes the task with the same tools and limits. The app labels which mode answered.
7. The user approves or rejects each proposal. Approval re-checks the proposal against current data, asks for the PIN when required, performs the action in the app's own stores (so Supabase RLS still applies), and writes a T2 entry to the activity log.

## 3. Tools and permission tiers

| Tool | Tier | Purpose |
|---|---|---|
| `plan_task` | T0 | State intent and ordered steps (must be called first) |
| `get_summary` | T0 | Income, expenses, profit, margin, expenses by category; compares with the previous window |
| `forecast_cash` | T0 | 30-day cash forecast: first deficit day, shortfall, triggering bill |
| `list_obligations` | T0 | Unpaid supplier debts and scheduled expenses |
| `find_transactions` | T0 | Search the user's transactions (returns ids as sources) |
| `detect_cost_spikes` | T1 | Categories up ≥15% vs the previous 30 days, with monthly savings |
| `match_financing` | T1 | Scores simulated lenders 0-100 with reasons and a risk warning |
| `propose_transaction` | T2 | Prepare a transaction (saved only after approval) |
| `propose_reschedule` | T2 | Prepare moving a bill; impact measured by re-running the forecast |
| `propose_reminder` | T2 | Prepare adding a bill to the forecast |
| `propose_financing_application` | T2 | Prepare a sandbox application (approval + PIN) |
| anything else | T3 | Refused and logged (moving money, other people's data, sending data out) |

## 4. Core algorithms

**Cash forecast** (`forecastCash`, `src/lib/financials.ts`):
balance(t) = current cash + (avg daily income − avg daily expense) × t − Σ unpaid obligations due by day t, with averages over the last 30 days. *Runway* = first day with balance < 0 (31 = none in 30 days). The division-free form avoids the "net burn ≤ 0" edge case.

**Action impact** (`propose_reschedule`): the forecast is re-run with the bill's new due date; *runway gained* = runway(after) − runway(before). In the evaluation, moving a Rp6,000,000 supplier debt by 14 days took runway from 6 to 20 days.

**Cost spikes** (`detect_cost_spikes`): per expense category, flag if this 30-day total ≥ 1.15 × the previous 30 days and the increase ≥ Rp20,000; potential monthly savings = Σ (now − before) over flagged categories.

**Financing match** (`scoreLender`, `src/lib/scoring.ts`): installment (flat) = P × (1 + r × n/12) / n; safe cap = 30% of average monthly profit (last 90 days). Score out of 100: repayment capacity 40, purpose & tenor fit 20, collateral 20, cost 10, speed 10. If the installment exceeds the cap the score is capped below 30 and `propose_financing_application` refuses to prepare it, so the agent cannot recommend an unaffordable loan.

**Intent and amounts without a model** (`rules.ts`): keyword classifier in English and Indonesian; amount parser for "Rp450.000", "2 juta", "1,5jt", "500rb", "5 million", "750k".

## 5. Security design (summary)

Full self-assessment: [docs/SECURITY-SELF-ASSESSMENT.md](SECURITY-SELF-ASSESSMENT.md).

- Permission tiers enforced in code: T2 cannot execute server-side; T3 is refused before any tool or model runs; unknown tool names are treated as T3.
- Input validation for every tool (zod schemas, amount ≤ Rp10 bn, ISO dates); hard caps on turns, tool calls and proposals per run.
- Prompt-injection defence: records are passed as data, the system prompt says so, and actions can only become proposals that the user reviews.
- Supabase Row Level Security on all tables; AI keys server-only; consent required and revocable.
- PIN (PBKDF2-SHA256, lockout after 5 tries) for exports, deletion, high-value approvals and financing applications.
- Tamper-evident activity log (SHA-256 hash chain, server timestamps, no update/delete).
- Rate limiting, origin checks and body limits on AI endpoints; CSP and security headers on every response.

## 6. Testing and evaluation

```sh
npm test               # 81 tests: agent scenarios, safe execution, model loop (mocked), security, PIN, finance logic, UI flows
npm run agent:eval     # runs the 10 agent scenarios and writes docs/evidence/agent-scenarios.md
npx tsc --noEmit
```

Scenario evaluation (PRD goal: at least 9 of 10): **10/10 pass**. See [docs/evidence/agent-scenarios.md](evidence/agent-scenarios.md) for the table and every event log. The model-driven loop is tested with mocked Gemini responses (tool chaining, refusal of an unknown tool, fallback to the rule agent on provider error).

## 7. Deployment

```sh
npm i
cp .env.example .env     # all values optional
npm run dev              # Vite dev server (URL printed in the terminal)
npm run build && npm start
```

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Account mode (run both SQL files in `supabase/migrations/` first) |
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | Claude-driven agent |
| `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) | Gemini-driven agent |
| `AI_PROVIDER` | `claude` or `gemini` when both keys are set |
| `AI_RATE_PER_MINUTE`, `AI_RATE_PER_DAY` | AI rate limits |

With no variables set, the app runs fully in device mode with the rule-based agent.

## 8. Limitations

- Lenders, rates and insurance products are **simulated**; no money moves and no real application is sent.
- The rule-based agent covers the six intents above; open-ended questions need an AI key.
- Rate limits are per server instance (in memory); production needs a shared store.
- The PIN gates actions in the app; it does not encrypt data already on the device.
- Receipt-scan accuracy has not been measured on a dedicated photo set.
