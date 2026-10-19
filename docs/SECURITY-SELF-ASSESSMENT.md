# FinTar: Security Self-Assessment

Scope: the Finix finance agent and the FinTar app (2026 FinTechathon, Topic E). This report covers the permission-tier implementation, the other security controls, and the known-risk list. Each control names the code that implements it and the test that checks it. (A longer Indonesian version with the UU PDP / OJK compliance mapping is in [SECURITY.md](SECURITY.md).)

## 1. Permission tiers

| Tier | Meaning | Examples | Enforcement | Logged as |
|---|---|---|---|---|
| **T0 Read** | Reads the user's own records | `get_summary`, `forecast_cash`, `list_obligations`, `find_transactions`, `plan_task` | Runs automatically on a per-request snapshot of the caller's data | Part of the `agent_run` entry (each step with tier and status) |
| **T1 Suggest** | Analysis or recommendation, always with reasons | `detect_cost_spikes`, `match_financing` | Runs automatically; outputs include reasons, factors and a risk warning | `agent_run` entry, tier T1 |
| **T2 Act** | Changes data or starts a (simulated) financial process | `propose_transaction`, `propose_reschedule`, `propose_reminder`, `propose_financing_application`; also user exports and imports | **Never executes on the server.** The tool returns a proposal; the app performs it only after the user taps **Approve**. Financing applications and transactions ≥ Rp10,000,000 also require the PIN. Rejected proposals change nothing. | `agent_<kind>` approved / rejected; `submit_proposal_sandbox` |
| **T3 Forbidden** | Moving money, reading or changing other people's data, sending data outside the app | "transfer 2 million to my supplier", "send my report to the bank's email" | Refused **before** any model or tool runs (`forbiddenRequest`); an unknown tool name requested by the model is also treated as T3 and refused | `finix_<kind>` blocked |

How the tiers are enforced in code:

- `src/lib/agent/tools.ts`: every tool declares its tier; T2 tools build a `Proposal` object and do not touch data. `runTool` validates the input with the tool's zod schema and returns an error (never throws) for unknown tools (T3) or invalid input.
- `src/lib/agent/execute.ts`: per-run caps of 12 tool calls and 3 proposals; each call is reported to the user as a step with its tier.
- `src/lib/agent.server.ts`: order of checks per request: origin, size and rate limit → login and AI consent → T3 refusal → agent loop (max 8 model turns).
- `src/components/FinixChat.tsx`: the only place T2 actions are performed, after **Approve**, re-checked against current data (for example, a bill that was already paid cannot be rescheduled), with the PIN where required.

Tests: `src/test/agent.test.ts` (10 scenarios incl. two T3 refusals and a prompt injection; unknown tool → T3; invalid input rejected; unaffordable loan blocked; T2 leaves data unchanged; model loop refuses an unknown tool call), `src/test/security.test.ts` (T3 detector, positive and negative cases).

## 2. Other controls

| Area | Control | Code | Test |
|---|---|---|---|
| Data isolation | Supabase Row Level Security on all 7 tables; tools only see the caller's snapshot | `supabase/migrations/20261009000000_fintar.sql` | Verified on PostgreSQL 16 |
| Financial safety | Agent cannot propose a loan whose installment exceeds 30% of average monthly profit; amounts capped at Rp10 bn; dates validated | `tools.ts` (`propose_financing_application`, zod schemas) | `agent.test.ts` |
| Prompt injection | Records are data (stated in the system prompt); outputs can only become proposals the user reviews | `agent.server.ts` | Scenario 10 |
| Consent | AI processing needs explicit, revocable consent, checked on the server in account mode | `auth.server.ts`, `ConsentGate.tsx` | `cloud.test.tsx` |
| Abuse / cost | Cross-site requests refused; body ≤ 2 MB; 20 requests/min and 300/day per client | `guard.server.ts` | `security.test.ts` |
| User control | 6-digit PIN (PBKDF2-SHA256, salted, 5 tries then 5-minute lock) for exports, deletion, high-value approvals and financing applications | `pin.ts`, `PinSheet.tsx` | `pin.test.tsx` |
| Audit | Activity log is append-only and hash-chained (SHA-256 of each row plus the previous hash; server timestamps; update/delete blocked even for the service role); the app verifies the chain | `20261016000000_audit_chain.sql`, `ActivityView.tsx` | Verified on PostgreSQL 16 |
| Accounts | New passwords: ≥ 8 characters with lowercase, uppercase, digit and symbol; same rule set in Supabase | `cloud.ts`, `AuthScreen.tsx` | `security.test.ts`, `cloud.test.tsx` |
| Web | Content-Security-Policy (no `eval`, no framing), HSTS, nosniff, Referrer-Policy, Permissions-Policy | `security-headers.ts` | Checked on the production build |
| Secrets | AI keys only in server environment variables; one module calls the models | `ai.server.ts` | — |
| Exports | CSV cells that would run as spreadsheet formulas are neutralised | `csv.ts` | `financials.test.ts` |
| Right to erasure | "Delete all my data" removes every row the account owns | `delete_my_data()` | `cloud.test.tsx` |

## 3. Known risks

Likelihood (L) and impact (I): Low / Medium / High. Residual risk is after the controls above.

| # | Risk | L | I | Mitigation | Residual |
|---|---|---|---|---|---|
| 1 | The model plans a harmful action | M | H | T2 only proposes; T3 refused; unknown tools refused; PIN for high value | Low |
| 2 | Prompt injection via transaction titles or receipt text | M | M | Treated as data; actions need approval; schema validation | Low |
| 3 | The model states a wrong number | M | M | Prompt requires tool-sourced figures; metrics come from tools, not the model; steps and sources shown | Medium (the wording is still model-written) |
| 4 | Unaffordable financing recommended | L | H | 30%-of-profit cap enforced in the tool, not only in the prompt | Low |
| 5 | Another user's data read | L | H | RLS; per-request snapshot | Low |
| 6 | AI quota or bill drained by third parties | H | M | Origin check, body limit, rate limit | Medium (limits are per server instance) |
| 7 | Borrowed, unlocked phone used to export or delete | H | M | PIN with lockout; actions logged | Low-Medium (screens remain visible) |
| 8 | Activity log altered | L | M | Hash chain, server timestamps, no update/delete | Low-Medium (the owner can still append rows through the API; a database owner who disables triggers can rewrite history, detectable against an exported hash) |
| 9 | User mistakes the simulation for real lending | M | H | "Simulation" banner and OJK disclaimer on every financing screen; "(simulated)" on every step | Low |
| 10 | Personal data sent to the AI provider | Certain when AI is used | M | Consent first, revocable; receipt photos not stored | Medium (no masking of names/phone numbers yet) |
| 11 | T3 detector misses an unusual phrasing | M | L | The agent has no money-moving tool, so the request cannot be executed; only the "blocked" log entry is missed | Low |
| 12 | Weak or leaked passwords | H | H | Strong-password rules in app and Supabase | Medium (leaked-password check needs Supabase Pro) |

## 4. Limitations and next steps

- Lender and insurance data are simulated; there is no real money movement and no real submission.
- Rate limits live in memory per server instance; production needs a shared store (e.g. Redis).
- CSP still allows inline scripts (server-rendered hydration data); next step is per-request nonces.
- Mask personal data before it reaches the AI; add a privacy policy page and a full data export.
- Device mode stores data unencrypted in the browser.
