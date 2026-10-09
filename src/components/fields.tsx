import type { ReactNode } from "react";
import { dateInputValue } from "@/lib/financials";

export const Label = ({ children }: { children: ReactNode }) => <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;

export function Chips<T extends string | number>({ options, value, onChange, format }: { options: readonly T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} type="button" onClick={() => onChange(o)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${o === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary"}`}>{format ? format(o) : String(o)}</button>
      ))}
    </div>
  );
}

export function MoneyInput({ value, onChange, large = false, autoFocus = false, label }: { value: number; onChange: (n: number) => void; large?: boolean; autoFocus?: boolean; label: string }) {
  return (
    <div className={`flex items-center rounded-2xl border border-border focus-within:ring-2 focus-within:ring-ring ${large ? "px-4" : "px-3"}`}>
      <span className={`font-bold ${large ? "" : "text-xs text-muted-foreground"}`}>Rp</span>
      <input aria-label={label} autoFocus={autoFocus} inputMode="numeric" value={value ? value.toLocaleString("id-ID") : ""} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 12)))} className={`min-w-0 flex-1 bg-transparent font-bold tabular-nums outline-none ${large ? "h-14 px-3 text-xl" : "h-11 px-2 text-sm"}`} placeholder="0" />
    </div>
  );
}

export function DateInput({ value, onChange, allowFuture = false }: { value: string; onChange: (v: string) => void; allowFuture?: boolean }) {
  return <input aria-label="Tanggal" type="date" value={value} {...(allowFuture ? {} : { max: dateInputValue() })} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />;
}
