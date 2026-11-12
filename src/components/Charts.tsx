import { useState } from "react";
import { cashFlowTrend, expenseBreakdown, rp, type Period, type Planned, type Profile, type Tx } from "@/lib/financials";
import type { Language } from "@/lib/i18n";

// Charts are plain SVG/HTML so the app does not ship a chart library to phones.
// Colours: validated categorical pair (blue = income, orange = expense); text stays in text tokens.
const INCOME = "#2a78d6";
const EXPENSE = "#eb6834";

/** Short money label for axes and tight spots: "1,2 jt" / "1.2M", "450 rb" / "450K". */
export function compactRp(n: number, lang: Language) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (v: number) => v.toLocaleString(lang === "en" ? "en-US" : "id-ID", { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (a >= 1e9) return `${sign}${fmt(a / 1e9)}${lang === "en" ? "B" : " M"}`;
  if (a >= 1e6) return `${sign}${fmt(a / 1e6)}${lang === "en" ? "M" : " jt"}`;
  if (a >= 1e3) return `${sign}${fmt(a / 1e3)}${lang === "en" ? "K" : " rb"}`;
  return `${sign}${Math.round(a)}`;
}

/** "Where your money goes": expense categories as ranked bars with amount and share. */
export function SpendingBreakdown({ txs, lang, limit = 5 }: { txs: Tx[]; lang: Language; limit?: number }) {
  const L = (en: string, id: string) => (lang === "en" ? en : id);
  const { total, rows } = expenseBreakdown(txs, lang);
  if (!rows.length) return <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">{L("No expenses in this period.", "Belum ada pengeluaran di periode ini.")}</p>;
  // Past the limit, the smallest categories fold into one "Other" row instead of getting more bars.
  const shown = rows.length > limit ? rows.slice(0, limit - 1) : rows;
  const rest = rows.slice(shown.length);
  const list = rest.length ? [...shown, { category: "_other", label: L("Other", "Lainnya"), value: rest.reduce((s, r) => s + r.value, 0), share: rest.reduce((s, r) => s + r.share, 0) }] : shown;
  return (
    <ul className="space-y-3" aria-label={L(`Expenses by category, total ${rp(total)}`, `Pengeluaran per kategori, total ${rp(total)}`)}>
      {list.map((r) => (
        <li key={r.category}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-foreground">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground"><span className="font-bold text-foreground">{rp(r.value)}</span> · {Math.round(r.share * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%`, background: EXPENSE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((m) => m >= v)!;
};

/**
 * Income vs expense as two long lines: solid up to today, dashed for the projection, with the
 * stretch where projected spending runs above income shaded and the first crossing called out.
 */
export function CashFlowChart({ all, period, profile, planned, lang }: { all: Tx[]; period: Period; profile: Profile; planned: Planned[]; lang: Language }) {
  const L = (en: string, id: string) => (lang === "en" ? en : id);
  const { unit, points, today, cross } = cashFlowTrend(all, period, profile, planned, lang);
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const hasForecast = today < n - 1;

  const W = 340, H = 196, left = 30, right = 74, top = 30, bottom = 20;
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.income, p.expense)), 0));
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const path = (key: "income" | "expense", from: number, to: number) => points.slice(from, to + 1).map((p, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");

  // Shaded stretches of the projection where expense > income, split at each crossing.
  const shade: string[] = [];
  for (let i = Math.max(1, today + 1); i < n; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const da = a.expense - a.income, db = b.expense - b.income;
    if (da <= 0 && db <= 0) continue;
    const at = (t: number, k: "income" | "expense") => [x(i - 1 + t), y(a[k] + (b[k] - a[k]) * t)] as const;
    const t0 = da > 0 ? 0 : -da / (db - da), t1 = db > 0 ? 1 : da / (da - db);
    const pts = [at(t0, "expense"), at(t1, "expense"), at(t1, "income"), at(t0, "income")];
    shade.push(pts.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("") + "Z");
  }

  const crossPt = cross ? (() => {
    const a = points[cross.from]!, b = points[cross.from + 1]!;
    return { cx: x(cross.from + cross.t), cy: y(a.expense + (b.expense - a.expense) * cross.t) };
  })() : null;
  const crossText = cross ? (cross.days <= 0 ? L("Now: expenses exceed income", "Sekarang: pengeluaran melebihi pemasukan") : L(`In ~${cross.days} days: expenses exceed income`, `±${cross.days} hari lagi: pengeluaran melebihi pemasukan`)) : "";
  const textW = crossText.length * 4.3;
  const annX = crossPt ? Math.min(W - 4 - textW / 2, Math.max(4 + textW / 2, crossPt.cx)) : 0;

  // End labels sit next to the last point; nudged apart when the lines end close together.
  const last = points[n - 1];
  let yInc = last ? y(last.income) : 0, yExp = last ? y(last.expense) : 0;
  if (Math.abs(yInc - yExp) < 12) { const mid = (yInc + yExp) / 2, up = yExp <= yInc ? -1 : 1; yExp = mid + up * 6; yInc = mid - up * 6; }

  // X labels: "today" and the last point always; others (first one included) only where they stay ~40px clear.
  const placed = [...new Set([today, n - 1])];
  for (let i = 0; i < n - 1; i++) if (!placed.includes(i) && placed.every((j) => Math.abs(x(i) - x(j)) >= 40)) placed.push(i);
  const showLabel = (i: number) => placed.includes(i);
  const markers = n <= 14;
  const read = active !== null ? points[active]! : null;
  const sum = points.slice(0, today + 1).reduce((s, p) => ({ income: s.income + p.income, expense: s.expense + p.expense }), { income: 0, expense: 0 });
  const shown = read ?? sum;
  const unitName = { day: L("day", "hari"), week: L("week", "minggu"), month: L("30 days", "30 hari") }[unit];

  if (n < 2) return <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">{L("Not enough records in this period yet.", "Catatan di periode ini belum cukup.")}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: INCOME }} />{L("Income", "Pemasukan")}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: EXPENSE }} />{L("Expense", "Pengeluaran")}</span>
        {hasForecast && <span className="flex items-center gap-1.5"><svg width="16" height="4" aria-hidden><line x1="0" x2="16" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" /></svg>{L("projection", "proyeksi")}</span>}
        <span className="ml-auto">{L(`per ${unitName}`, `per ${unitName}`)}</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-muted px-3 py-2 text-[11px]" aria-live="polite">
        <div><p className="truncate text-muted-foreground">{read ? `${read.label}${read.forecast ? L(" (projected)", " (proyeksi)") : ""}` : L("Until today", "Sampai hari ini")}</p><p className="font-bold tabular-nums text-foreground">{L("In", "Masuk")} {compactRp(shown.income, lang)}</p></div>
        <div><p className="text-muted-foreground">&nbsp;</p><p className="font-bold tabular-nums text-foreground">{L("Out", "Keluar")} {compactRp(shown.expense, lang)}</p></div>
        <div className="text-right"><p className="text-muted-foreground">{L("Net", "Selisih")}</p><p className={`font-bold tabular-nums ${shown.income - shown.expense >= 0 ? "text-success" : "text-danger"}`}>{shown.income - shown.expense >= 0 ? "+" : ""}{compactRp(shown.income - shown.expense, lang)}</p></div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full touch-none select-none" role="img" aria-label={L(`Income and expense per ${unitName}${cross ? `; ${crossText}` : ""}`, `Pemasukan dan pengeluaran per ${unitName}${cross ? `; ${crossText}` : ""}`)} onPointerLeave={() => setActive(null)}>
        {hasForecast && <rect x={x(today)} y={top - 6} width={x(n - 1) - x(today)} height={plotH + 6} fill={INCOME} opacity={0.07} />}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={x(n - 1)} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" strokeWidth={f === 0 ? 1 : 0.5} />
            <text x={left - 4} y={y(max * f) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={8}>{compactRp(max * f, lang)}</text>
          </g>
        ))}
        {hasForecast && <line x1={x(today)} x2={x(today)} y1={top - 6} y2={top + plotH} stroke={INCOME} strokeWidth={1} opacity={0.6} />}
        {shade.map((d, i) => <path key={i} d={d} fill={EXPENSE} opacity={0.2} />)}

        {(["income", "expense"] as const).map((k) => (
          <g key={k} fill="none" stroke={k === "income" ? INCOME : EXPENSE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={path(k, 0, today)} />
            {hasForecast && <path d={path(k, today, n - 1)} strokeDasharray="4 4" />}
          </g>
        ))}
        {(["income", "expense"] as const).map((k) => points.map((p, i) => (markers && !p.forecast) || i === today || i === active ? (
          <circle key={`${k}${i}`} cx={x(i)} cy={y(p[k])} r={3.5} fill="white" stroke={k === "income" ? INCOME : EXPENSE} strokeWidth={2} />
        ) : null))}

        {crossPt && (
          <g>
            <line x1={crossPt.cx} x2={crossPt.cx} y1={12} y2={crossPt.cy - 7} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} />
            <circle cx={crossPt.cx} cy={crossPt.cy} r={6} fill="white" stroke="#a8431b" strokeWidth={2.5} />
            <text x={annX} y={9} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-foreground">{crossText}</text>
          </g>
        )}

        {last && (
          <g fontSize={8.5} fontWeight={600} className="fill-foreground">
            <circle cx={x(n - 1) + 7} cy={yExp} r={2.5} fill={EXPENSE} /><text x={x(n - 1) + 12} y={yExp + 3}>{L("Expense", "Pengeluaran")}</text>
            <circle cx={x(n - 1) + 7} cy={yInc} r={2.5} fill={INCOME} /><text x={x(n - 1) + 12} y={yInc + 3}>{L("Income", "Pemasukan")}</text>
          </g>
        )}

        {points.map((p, i) => showLabel(i) && (
          <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={8} fontWeight={i === today ? 700 : 400} className={i === today ? "fill-foreground" : "fill-muted-foreground"}>{i === today && hasForecast ? L("Today", "Hari ini") : p.label}</text>
        ))}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={top} y2={top + plotH} stroke="currentColor" className="text-muted-foreground" strokeWidth={0.75} strokeDasharray="2 2" />}
        {points.map((_, i) => (
          <rect key={i} x={x(i) - plotW / Math.max(1, n - 1) / 2} y={top - 6} width={plotW / Math.max(1, n - 1)} height={plotH + 6} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(active === i ? null : i)} />
        ))}
      </svg>

      <table className="sr-only">
        <caption>{L("Income and expense, actual and projected", "Pemasukan dan pengeluaran, aktual dan proyeksi")}</caption>
        <thead><tr><th>{L("Period", "Periode")}</th><th>{L("Income", "Pemasukan")}</th><th>{L("Expense", "Pengeluaran")}</th><th>{L("Type", "Jenis")}</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{rp(p.income)}</td><td>{rp(p.expense)}</td><td>{p.forecast ? L("projection", "proyeksi") : L("actual", "aktual")}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
