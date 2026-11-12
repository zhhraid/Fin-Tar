import { useState } from "react";
import { cashFlowSeries, expenseBreakdown, rp, type Period, type Tx } from "@/lib/financials";
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

/** Column with a 4px rounded top anchored to the baseline. */
const topRounded = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/** Income vs expense per day, week or month of the period, with tap/hover read-out. */
export function CashFlowChart({ all, period, lang }: { all: Tx[]; period: Period; lang: Language }) {
  const L = (en: string, id: string) => (lang === "en" ? en : id);
  const { unit, buckets } = cashFlowSeries(all, period, lang);
  const [active, setActive] = useState<number | null>(null);
  const totals = buckets.reduce((s, b) => ({ income: s.income + b.income, expense: s.expense + b.expense }), { income: 0, expense: 0 });
  const shown = active !== null ? buckets[active] : null;
  const read = shown ?? totals;

  const W = 320, H = 150, left = 34, right = 4, top = 6, bottom = 20;
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = niceMax(Math.max(...buckets.map((b) => Math.max(b.income, b.expense)), 0));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(1, buckets.length);
  const barW = Math.max(2, Math.min(14, (slot - 6) / 2));
  const every = Math.ceil(buckets.length / 6); // at most ~6 x labels, so they never collide
  const unitName = { day: L("day", "hari"), week: L("week", "minggu"), month: L("month", "bulan") }[unit];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: INCOME }} />{L("Income", "Pemasukan")}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} />{L("Expense", "Pengeluaran")}</span>
        <span className="ml-auto">{L(`per ${unitName}`, `per ${unitName}`)}</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-muted px-3 py-2 text-[11px]" aria-live="polite">
        <div><p className="text-muted-foreground">{shown ? shown.label : L("Whole period", "Seluruh periode")}</p><p className="font-bold tabular-nums text-foreground">{L("In", "Masuk")} {compactRp(read.income, lang)}</p></div>
        <div><p className="text-muted-foreground">&nbsp;</p><p className="font-bold tabular-nums text-foreground">{L("Out", "Keluar")} {compactRp(read.expense, lang)}</p></div>
        <div className="text-right"><p className="text-muted-foreground">{L("Net", "Selisih")}</p><p className={`font-bold tabular-nums ${read.income - read.expense >= 0 ? "text-success" : "text-danger"}`}>{read.income - read.expense >= 0 ? "+" : ""}{compactRp(read.income - read.expense, lang)}</p></div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full touch-none select-none" role="img" aria-label={L(`Income ${rp(totals.income)} and expense ${rp(totals.expense)} per ${unitName}`, `Pemasukan ${rp(totals.income)} dan pengeluaran ${rp(totals.expense)} per ${unitName}`)} onPointerLeave={() => setActive(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - right} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" strokeWidth={f === 0 ? 1 : 0.5} />
            <text x={left - 4} y={y(max * f) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={8}>{compactRp(max * f, lang)}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = left + slot * i + slot / 2;
          const dim = active !== null && active !== i;
          return (
            <g key={i} opacity={dim ? 0.35 : 1}>
              {b.income > 0 && <path d={topRounded(cx - barW - 1, y(b.income), barW, y(0) - y(b.income))} fill={INCOME} />}
              {b.expense > 0 && <path d={topRounded(cx + 1, y(b.expense), barW, y(0) - y(b.expense))} fill={EXPENSE} />}
              {i % every === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>{b.label}</text>}
              {/* Hit target: the whole column, bigger than the bars. */}
              <rect x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(active === i ? null : i)} />
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{L("Income and expense per period", "Pemasukan dan pengeluaran per periode")}</caption>
        <thead><tr><th>{L("Period", "Periode")}</th><th>{L("Income", "Pemasukan")}</th><th>{L("Expense", "Pengeluaran")}</th></tr></thead>
        <tbody>{buckets.map((b, i) => <tr key={i}><td>{b.label}</td><td>{rp(b.income)}</td><td>{rp(b.expense)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
