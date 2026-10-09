import { AlertTriangle, ArrowLeft, BadgeCheck, CalendarClock, CheckCircle2, Download, FileText, Flame, HeartPulse, Info, Landmark, Loader2, Lock, Pencil, Plus, ShieldCheck, Store, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chips, DateInput, Label, MoneyInput } from "@/components/fields";
import { exportProposalPdf } from "@/lib/export";
import { addPlanned, cancelInsurance, chooseInsurance, clearLoan, currentInsurance, dateInputValue, daysUntil, forecastCash, getCreditProfile, getInsights, loanStage, loanStages, logActivity, openPlanned, payableTotal, removePlanned, rp, settlePlanned, shortDate, submitLoan, updatePlanned, useActivity, useLedger, useLoanApplication, usePlanned, useProfile, type Insight, type InsuranceChoice, type LoanApplication, type Planned } from "@/lib/financials";
import { healthyCap, rankLenders, type LenderMatch } from "@/lib/scoring";
import { useTranslation } from "@/lib/i18n";

function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex items-center gap-3 px-5 pb-2 pt-6">
      <Button variant="icon" size="icon" className="rounded-full" onClick={onBack} aria-label={t("back")}><ArrowLeft size={18} /></Button>
      <div><p className="text-xs font-bold text-primary">{eyebrow}</p><h1 className="text-xl font-extrabold">{title}</h1></div>
    </header>
  );
}

const SimNote = ({ children }: { children: ReactNode }) => <p className="mt-3 flex gap-2 rounded-xl bg-muted px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0 text-primary" /><span>{children}</span></p>;

/* ---------- Financing matching ---------- */
type Draft = Omit<LoanApplication, "id" | "submittedAt">;

export function LoanView({ onBack }: { onBack: () => void }) {
  const { t, lang } = useTranslation();
  const [amount, setAmount] = useState(5000000);
  const [purpose, setPurpose] = useState(t("purposeStock"));
  const [tenor, setTenor] = useState(12);
  const [draft, setDraft] = useState<Draft | null>(null);
  const application = useLoanApplication();
  const profile = useProfile();
  const credit = getCreditProfile(useLedger());

  if (application) return <LoanStatus application={application} onBack={onBack} />;
  if (draft) return <LoanProposal draft={draft} onBack={() => setDraft(null)} />;

  const matches = rankLenders(amount, purpose, tenor, credit.monthlyProfit);
  const draftFor = (m: LenderMatch) => {
    const next = { lender: m.lender.name, amount, purpose, tenor: m.tenor, installment: m.installment };
    logActivity({ tool: "draft_proposal", tier: "T1", status: "completed", summary: `Draf proposal ${rp(amount)} untuk ${m.lender.name} (skor ${m.score})`, detail: { ...next, score: m.score } });
    setDraft(next);
  };

  const purposeOptions = [t("purposeStock"), t("purposeEquipment"), t("purposeRenovation")];

  return (
    <main className="pb-6">
      <Header eyebrow={t("loanEyebrow")} title={t("loanTitle")} onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-2xl bg-muted p-4 text-xs leading-relaxed">
          <p className="font-bold text-foreground">{t("eligibilityProfile")} {profile.name}</p>
          <p className="mt-1 text-muted-foreground">
            {t("avgProfit")} {rp(credit.monthlyProfit)}{t("perMonth")} • {credit.txCount} {t("recordedTransactions")} {credit.recordedDays} {t("daysCount")}. {t("healthyCapNote")} <strong className="text-foreground">{rp(healthyCap(credit.monthlyProfit))}{t("perMonth")}</strong>.
          </p>
        </div>
        <Label>{t("howMuchCapital")}</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={amount} onChange={setAmount} format={(v) => (lang === "en" ? `Rp${v / 1e6}M` : `Rp${v / 1e6} jt`)} />
        <Label>{t("forWhatPurpose")}</Label>
        <Chips options={purposeOptions} value={purpose} onChange={setPurpose} />
        <Label>{t("tenorLabel")}</Label>
        <Chips options={[6, 12, 24]} value={tenor} onChange={setTenor} format={(v) => `${v} ${t("monthsCount")}`} />

        <h2 className="mb-1 mt-7 font-bold">{t("suitableOptions")}</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">{t("simulatedLenderNote")}</p>
        <div className="space-y-3">
          {matches.map((m, i) => (
            <div key={m.lender.name} className={`rounded-2xl border p-4 ${m.eligible ? (i === 0 ? "border-primary" : "border-border") : "border-border opacity-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><Landmark size={18} /></div>
                  <div><p className="text-sm font-bold">{m.lender.name}</p><p className="text-[10px] text-muted-foreground">{m.lender.type}</p></div>
                </div>
                {m.eligible ? <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${m.risk ? "bg-danger-soft text-danger" : "bg-primary text-primary-foreground"}`}>{t("scoreLabel")} {m.score}/100</span> : <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Lock size={11} /> {t("ineligibleLabel")}</span>}
              </div>
              {!m.eligible && <p className="mt-2 text-[11px] text-muted-foreground">{m.blocker}</p>}
              {m.eligible && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                    <div><p className="text-muted-foreground">{t("interestLabel")}</p><p className="text-xs font-bold">{Math.round(m.lender.rate * 100)}%{t("perYear")}</p></div>
                    <div><p className="text-muted-foreground">{t("installmentLabel")} × {m.tenor} {t("month")}</p><p className="text-xs font-bold">{rp(m.installment)}</p></div>
                    <div><p className="text-muted-foreground">{t("disbursementLabel")}</p><p className="text-xs font-bold">{m.lender.daysLabel}</p></div>
                  </div>
                  {m.risk && <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-semibold text-danger"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {t("capWarningText", { cap: rp(m.cap) })}</p>}
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("scoreReasons")}</p>
                  <ul className="mt-1 space-y-1">
                    {m.factors.map((f) => (
                      <li key={f.label} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span className={`mt-0.5 w-9 shrink-0 text-right font-bold tabular-nums ${f.points >= f.max * 0.7 ? "text-success" : "text-danger"}`}>{f.points}/{f.max}</span>
                        <span className="text-muted-foreground"><span className="font-semibold text-foreground">{f.label}.</span> {f.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant={i === 0 && !m.risk ? "default" : "secondary"} className="mt-3 h-10 w-full text-xs" onClick={() => draftFor(m)}>{t("createProposalBtn")}</Button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => <div className="flex justify-between gap-4 py-1 text-xs"><span className="text-muted-foreground">{label}</span><span className="shrink-0 text-right font-bold">{value}</span></div>;

function LoanProposal({ draft, onBack }: { draft: Draft; onBack: () => void }) {
  const profile = useProfile();
  const ledger = useLedger();
  const planned = usePlanned();
  const credit = getCreditProfile(ledger);
  const [agree, setAgree] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { t } = useTranslation();
  const pdf = async () => {
    setExporting(true);
    try {
      await exportProposalPdf(draft, ledger, profile, planned);
    } catch {
      toast.error(t("pdfGenError"));
    }
    setExporting(false);
  };
  return (
    <main className="pb-6">
      <Header eyebrow={`PROPOSAL • ${draft.lender.toUpperCase()}`} title={t("reviewProposalTitle")} onBack={onBack} />
      <div className="px-5">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("proposalAutoFilledDesc")}</p>

        <section className="mt-4 rounded-3xl border border-border p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><Store size={15} /></span>{t("businessProfileCard")}</h2>
          <Fact label={t("businessNameLabel")} value={profile.name} />
          <Fact label={t("businessCategoryLabel")} value={profile.category} />
          <Fact label={t("recordingDuration")} value={`${credit.recordedDays} ${t("day")} • ${credit.txCount} ${t("transactionsCount")}`} />
        </section>

        <section className="mt-3 rounded-3xl border border-border p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><FileText size={15} /></span>{t("financialSummaryCard")}</h2>
          <Fact label={t("avgRevenue")} value={`${rp(credit.monthlyRevenue)}${t("perMonth")}`} />
          <Fact label={t("avgNetProfit")} value={`${rp(credit.monthlyProfit)}${t("perMonth")}`} />
          <Fact label={t("netMarginLabel")} value={`${(credit.margin * 100).toFixed(1)}%`} />
          <Fact label={t("currentPayables")} value={rp(payableTotal(planned))} />
          <p className="mt-2 text-[10px] text-muted-foreground">{t("attachmentNote")}</p>
        </section>

        <section className="mt-3 rounded-3xl border border-primary p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><Landmark size={15} /></span>{t("appliedLoanCard")}</h2>
          <Fact label={t("amountLabel")} value={rp(draft.amount)} />
          <Fact label={t("forWhatPurpose")} value={draft.purpose} />
          <Fact label={t("tenorLabel")} value={`${draft.tenor} ${t("monthsCount")}`} />
          <Fact label={t("installmentLabel")} value={rp(draft.installment)} />
          <Fact label={t("portionOfProfit")} value={credit.monthlyProfit > 0 ? `${Math.round((draft.installment / credit.monthlyProfit) * 100)}%` : "-"} />
        </section>

        <Button variant="secondary" className="mt-4 h-11 w-full text-xs" disabled={exporting} onClick={pdf}>{exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {t("downloadPdfProposal")}</Button>

        <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
          <span>{t("agreeShareLoanInfo", { lender: draft.lender })}</span>
        </label>
        <Button className="mt-4 h-12 w-full" disabled={!agree} onClick={() => submitLoan(draft)}>{t("sendProposalBtn")}</Button>
        <SimNote>{t("simulatedLoanDisclaimer")}</SimNote>
      </div>
    </main>
  );
}

function LoanStatus({ application, onBack }: { application: LoanApplication; onBack: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const { t, lang } = useTranslation();
  const stage = loanStage(application, now);
  const done = stage === loanStages.length - 1;
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [done]);
  const hints = [t("loanHint1"), t("loanHint2"), t("loanHint3")];
  const stageLabels = [t("loanStage1"), t("loanStage2"), t("loanStage3")];
  return (
    <main className="pb-6">
      <Header eyebrow={t("loanStatusEyebrow")} title={application.lender} onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="text-xs opacity-75">{application.purpose}</p>
          <p className="mt-1 text-2xl font-bold">{rp(application.amount)}</p>
          <p className="mt-1 text-[11px] opacity-75">{rp(application.installment)} × {application.tenor} {t("month")}</p>
        </div>

        <ol className="mt-6 space-y-5">
          {loanStages.map((s, i) => {
            const state = i < stage || (done && i === stage) ? "done" : i === stage ? "active" : "todo";
            return (
              <li key={s} className={`flex gap-3 ${state === "todo" ? "opacity-40" : ""}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-success-soft text-success" : "bg-muted text-primary"}`}>{state === "done" ? <CheckCircle2 size={16} /> : state === "active" ? <Loader2 size={16} className="animate-spin" /> : <span className="text-xs font-bold">{i + 1}</span>}</span>
                <div><p className="text-sm font-bold">{stageLabels[i] || s}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hints[i]}</p></div>
              </li>
            );
          })}
        </ol>

        <SimNote>{t("loanStatusSimulation")}</SimNote>
        <Button variant="secondary" className="mt-4 h-11 w-full text-xs" onClick={clearLoan}>{done ? t("newLoanBtn") : t("cancelLoanBtn")}</Button>
      </div>
    </main>
  );
}

/* ---------- Insurance matching (simulated: no policy is issued) ---------- */
const risks = [
  { key: "fire", icon: <Flame size={16} /> },
  { key: "theft", icon: <Lock size={16} /> },
  { key: "biz", icon: <Store size={16} /> },
  { key: "health", icon: <HeartPulse size={16} /> },
];

const plans = [
  { name: "Proteksi Toko Dasar", covers: ["fire"], rate: 0.0012, note: "Peralatan dan bangunan toko" },
  { name: "Proteksi Toko Plus", covers: ["fire", "theft"], rate: 0.002, note: "Termasuk kehilangan stok & uang kas" },
  { name: "Usaha Aman Lengkap", covers: ["fire", "theft", "biz"], rate: 0.003, note: "Ganti rugi pendapatan saat toko tutup paksa" },
  { name: "Sehat Karyawan Mikro", covers: ["health"], rate: 0, fixed: 45000, note: "Rawat jalan & inap untuk 1–5 karyawan" },
];
type PlanDraft = Omit<InsuranceChoice, "at"> & { uncovered: string[] };

export function InsuranceView({ onBack }: { onBack: () => void }) {
  const [picked, setPicked] = useState<string[]>(["fire", "theft"]);
  const [assetValue, setAssetValue] = useState(10000000);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const { t, lang } = useTranslation();
  const profit = getCreditProfile(useLedger()).monthlyProfit;
  const chosen = currentInsurance(useActivity());
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const riskLabel = (key: string) => {
    switch (key) {
      case "fire": return t("riskFire");
      case "theft": return t("riskTheft");
      case "biz": return t("riskBiz");
      case "health": return t("riskHealth");
      default: return key;
    }
  };

  if (chosen) return <InsuranceStatus choice={chosen} profit={profit} onBack={onBack} />;
  if (draft) return <InsuranceConfirm draft={draft} profit={profit} onBack={() => setDraft(null)} />;

  const results = plans
    .map((p) => {
      const hit = p.covers.filter((c) => picked.includes(c)).length;
      const miss = picked.filter((c) => !p.covers.includes(c)).length;
      const premium = p.fixed ?? Math.max(15000, Math.round((assetValue * p.rate) / 1000) * 1000);
      const score = hit === 0 ? 0 : Math.round((hit / (hit + miss)) * 100 - Math.max(0, p.covers.length - hit) * 8);
      return { ...p, premium, score, hit };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <main className="pb-6">
      <Header eyebrow={t("insuranceEyebrow")} title={t("insuranceTitle")} onBack={onBack} />
      <div className="px-5">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("insuranceIntro")}</p>
        <ol className="mt-3 space-y-1.5 rounded-2xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
          <li><strong className="text-foreground">1.</strong> {lang === "en" ? "Select risks of concern and your shop asset value." : "Pilih risiko yang kamu khawatirkan dan nilai aset tokomu."}</li>
          <li><strong className="text-foreground">2.</strong> {lang === "en" ? "FinTar matches packages and compares premiums against your net profit." : "FinTar mencocokkan paket dan membandingkan preminya dengan labamu."}</li>
          <li><strong className="text-foreground">3.</strong> {lang === "en" ? "Select a package, then FinTar prepares your data for providers (simulated)." : "Pilih paket, lalu FinTar meneruskan data usahamu ke penyedia (simulasi)."}</li>
        </ol>
        <Label>{t("risksToProtect")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {risks.map((r) => {
            const on = picked.includes(r.key);
            return <button key={r.key} onClick={() => toggle(r.key)} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{r.icon}{riskLabel(r.key)}</button>;
          })}
        </div>
        <Label>{t("shopAssetValue")}</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={assetValue} onChange={setAssetValue} format={(v) => (lang === "en" ? `Rp${v / 1e6}M` : `Rp${v / 1e6} jt`)} />

        <h2 className="mb-1 mt-7 font-bold">{t("recommendedPackages")}</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">{t("insuranceSimNote")}</p>
        {results.length === 0 && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">{t("pickMinRisk")}</p>}
        <div className="space-y-3">
          {results.map((p, i) => (
            <div key={p.name} className={`rounded-2xl border p-4 ${i === 0 ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary"><ShieldCheck size={18} /></div><div><p className="text-sm font-bold">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.note}</p></div></div>
                <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">{p.score}% {t("matchPct")}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.covers.map((c) => <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold">{riskLabel(c)}</span>)}</div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t("coversHitOfPicked", { hit: p.hit, total: picked.length })}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><p className="text-[10px] text-muted-foreground">{t("monthlyPremium")}</p><p className="text-base font-extrabold">{rp(p.premium)}</p>{profit > 0 && <p className="text-[10px] text-success">{((p.premium / profit) * 100).toFixed(1)}% {t("fromMonthlyProfit")}</p>}</div>
                <Button variant={i === 0 ? "default" : "secondary"} className="h-10 shrink-0 px-4 text-xs" onClick={() => setDraft({ name: p.name, premium: p.premium, covers: p.covers, assetValue, uncovered: picked.filter((c) => !p.covers.includes(c)) })}>{t("choosePackageBtn")}</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function InsuranceConfirm({ draft, profit, onBack }: { draft: PlanDraft; profit: number; onBack: () => void }) {
  const profile = useProfile();
  const [agree, setAgree] = useState(false);
  const { t } = useTranslation();
  const { uncovered, ...choice } = draft;

  const riskLabel = (key: string) => {
    switch (key) {
      case "fire": return t("riskFire");
      case "theft": return t("riskTheft");
      case "biz": return t("riskBiz");
      case "health": return t("riskHealth");
      default: return key;
    }
  };

  return (
    <main className="pb-6">
      <Header eyebrow={t("confirmPackageEyebrow")} title={draft.name} onBack={onBack} />
      <div className="px-5">
        <section className="mt-3 rounded-3xl border border-primary p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><ShieldCheck size={15} /></span>{t("protectionSummaryCard")}</h2>
          <Fact label={t("businessLabel")} value={profile.name} />
          <Fact label={t("protectedAssetValue")} value={rp(draft.assetValue)} />
          <Fact label={t("monthlyPremium")} value={rp(draft.premium)} />
          <Fact label={t("portionOfProfit")} value={profit > 0 ? `${((draft.premium / profit) * 100).toFixed(1)}%` : "-"} />
        </section>

        <section className="mt-3 rounded-3xl border border-border p-5">
          <h2 className="mb-2 text-sm font-extrabold">{t("whatIsCovered")}</h2>
          <ul className="space-y-1.5">{draft.covers.map((c) => <li key={c} className="flex items-center gap-2 text-xs"><CheckCircle2 size={14} className="shrink-0 text-success" /> {riskLabel(c)}</li>)}</ul>
          {uncovered.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-extrabold">{t("whatIsNotCovered")}</h2>
              <ul className="space-y-1.5">{uncovered.map((c) => <li key={c} className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle size={14} className="shrink-0 text-danger" /> {riskLabel(c)}</li>)}</ul>
            </>
          )}
        </section>

        <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
          <span>{t("agreeShareInsuranceInfo")}</span>
        </label>
        <Button className="mt-4 h-12 w-full" disabled={!agree} onClick={() => chooseInsurance(choice)}>{t("applyThisPackageBtn")}</Button>
        <SimNote>{t("insuranceDisclaimer")}</SimNote>
      </div>
    </main>
  );
}

function InsuranceStatus({ choice, profit, onBack }: { choice: InsuranceChoice; profit: number; onBack: () => void }) {
  const planned = usePlanned();
  const { t, lang } = useTranslation();
  const premiumLabel = lang === "en" ? `Premium ${choice.name}` : `Premi ${choice.name}`;
  const scheduled = openPlanned(planned).some((p) => p.label.includes(choice.name));
  
  const riskLabel = (key: string) => {
    switch (key) {
      case "fire": return t("riskFire");
      case "theft": return t("riskTheft");
      case "biz": return t("riskBiz");
      case "health": return t("riskHealth");
      default: return key;
    }
  };

  const steps = [
    { title: t("insStatus1Title"), text: t("insStatus1Desc"), done: true },
    { title: t("insStatus2Title"), text: t("insStatus2Desc"), done: false },
    { title: t("insStatus3Title"), text: t("insStatus3Desc"), done: false },
  ];
  return (
    <main className="pb-6">
      <Header eyebrow={t("insuranceEyebrow")} title={t("appliedPackageTitle")} onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="text-xs opacity-75">{t("appliedOn")} {new Date(choice.at).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="mt-1 text-xl font-bold">{choice.name}</p>
          <p className="mt-1 text-[11px] opacity-75">{rp(choice.premium)}{t("perMonth")}{profit > 0 ? ` • ${((choice.premium / profit) * 100).toFixed(1)}% ${t("fromMonthlyProfit")}` : ""} • {t("assetsProtected")} {rp(choice.assetValue)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{choice.covers.map((c) => <span key={c} className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-semibold">{riskLabel(c)}</span>)}</div>
        </div>

        <ol className="mt-6 space-y-5">
          {steps.map((s, i) => (
            <li key={s.title} className={`flex gap-3 ${s.done ? "" : "opacity-50"}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${s.done ? "bg-success-soft text-success" : "bg-muted text-primary"}`}>{s.done ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">{i + 1}</span>}</span>
              <div><p className="text-sm font-bold">{s.title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p></div>
            </li>
          ))}
        </ol>

        <SimNote>{t("insSimulationProcess")}</SimNote>

        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold">{t("addPremiumToForecast")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{scheduled ? t("premiumAlreadyScheduled") : t("premiumNotScheduled")}</p>
          {!scheduled && <Button variant="secondary" className="mt-3 h-10 w-full text-xs" onClick={() => addPlanned({ kind: "expense", label: premiumLabel, amount: choice.premium, due: dateInputValue(new Date(Date.now() + 30 * 86400000)) })}><CalendarClock size={14} /> {t("schedulePremiumBtn")} {rp(choice.premium)}</Button>}
        </div>
        <Button variant="secondary" className="mt-3 h-11 w-full text-xs" onClick={cancelInsurance}>{t("cancelAndPickOther")}</Button>
      </div>
    </main>
  );
}

/* ---------- Cashflow alerts, forecast and upcoming obligations ---------- */
const alertStyle = {
  danger: { box: "border-rose-500/25 bg-rose-500/5", iconWrap: "bg-rose-500/15 text-rose-600", icon: <AlertTriangle size={16} className="text-rose-600" /> },
  warning: { box: "border-amber-500/25 bg-amber-500/5", iconWrap: "bg-amber-500/15 text-amber-600", icon: <AlertTriangle size={16} className="text-amber-600" /> },
  success: { box: "border-emerald-500/25 bg-emerald-500/5", iconWrap: "bg-emerald-500/15 text-emerald-600", icon: <TrendingUp size={16} className="text-emerald-600" /> },
};

export function AlertCard({ alert, children }: { alert: Insight; children?: ReactNode }) {
  const s = alertStyle[alert.level];
  return (
    <div className={`flex gap-3 rounded-2xl border p-3.5 shadow-sm transition-all ${s.box}`}>
      <div className={`grid size-8 shrink-0 place-items-center rounded-xl ${s.iconWrap}`}>
        {s.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-foreground leading-snug">{alert.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{alert.text}</p>
        {children}
      </div>
    </div>
  );
}

function PlannedForm({ initial, onDone }: { initial?: Planned | null; onDone: () => void }) {
  const [kind, setKind] = useState<Planned["kind"]>(initial?.kind ?? "debt");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [due, setDue] = useState(initial?.due ?? dateInputValue);
  const { t } = useTranslation();

  const save = () => {
    if (!amount || !due) return;
    const itemLabel = label.trim().slice(0, 80) || (kind === "debt" ? t("supplierDebt") : t("scheduledExpense"));
    if (initial) {
      updatePlanned(initial.id, { kind, label: itemLabel, amount, due });
      toast.success(t("obligationUpdatedToast"));
    } else {
      addPlanned({ kind, label: itemLabel, amount, due });
      toast.success(t("obligationAddedToast"));
    }
    onDone();
  };

  return (
    <div className="rounded-2xl border border-primary p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">{initial ? t("editObligationTitle") : t("addObligationTitle")}</h3>
      <div className="grid grid-cols-2 gap-2">
        {(["debt", "expense"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-xl border py-2.5 text-xs font-bold ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{k === "debt" ? t("debtOption") : t("expenseOption")}</button>)}
      </div>
      <Label>{t("obligationDescLabel")}</Label>
      <input aria-label="Keterangan kewajiban" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={kind === "debt" ? t("debtPlaceholder") : t("expensePlaceholder")} />
      <Label>{t("obligationAmountLabel")}</Label>
      <MoneyInput label={t("obligationAmountLabel")} value={amount} onChange={setAmount} />
      <Label>{t("dueDateLabel")}</Label>
      <DateInput value={due} onChange={setDue} allowFuture />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-11 text-xs" onClick={onDone}>{t("cancel")}</Button>
        <Button className="h-11 text-xs" disabled={!amount || !due} onClick={save}>{t("save")}</Button>
      </div>
    </div>
  );
}

export function AlertsView({ onBack, onLoan, onAsk, onEntry }: { onBack: () => void; onLoan: () => void; onAsk: (prompt: string) => void; onEntry: () => void }) {
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<Planned | null>(null);
  const { t, lang } = useTranslation();

  const insights = getInsights(ledger, profile, planned);
  const forecast = forecastCash(ledger, profile, planned);
  const open = openPlanned(planned);
  const isSparse = ledger.length < 5;

  const actions = {
    loan: { label: t("seeCapitalOptions"), run: onLoan },
    entry: { label: t("recordNow"), run: onEntry },
  };

  return (
    <main className="pb-6">
      <Header eyebrow={t("alertsEyebrow")} title={t("alertsTitle")} onBack={onBack} />
      <div className="space-y-3 px-5 pt-3">
        {insights.map((a) => (
          <AlertCard key={a.title} alert={a}>
            {a.action && (
              <button className="mt-2 text-xs font-bold text-primary" onClick={a.action === "finix" ? () => onAsk(lang === "en" ? `${a.title}. Why did this happen and what should I do?` : `${a.title}. Kenapa bisa begitu dan apa yang sebaiknya kulakukan?`) : actions[a.action].run}>{a.action === "finix" ? t("askFinixAlert") : actions[a.action].label} →</button>
            )}
          </AlertCard>
        ))}

        <section className="rounded-3xl border border-border p-5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><TrendingUp size={15} /></span>{t("cashForecastTitle")}</h2>
          
          {isSparse && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-xs text-warning">
              <Info size={16} className="mt-0.5 shrink-0" />
              <p>{t("sparseDataNotice", { count: ledger.length })}</p>
            </div>
          )}

          <div className="mt-3 space-y-1 text-xs">
            <Fact label={t("currentCashLabel")} value={rp(forecast.cash)} />
            <Fact label={t("dailyInLabel")} value={`+${rp(forecast.dailyIn)}`} />
            <Fact label={t("dailyOutLabel")} value={`-${rp(forecast.dailyOut)}`} />
            <Fact label={t("dueTotalLabel")} value={`-${rp(forecast.dueTotal)}`} />
          </div>
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed ${forecast.deficit ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
            {forecast.deficit
              ? t("forecastDeficit", { day: forecast.deficit.day, amount: rp(forecast.deficit.shortfall) })
              : t("forecastSurplus", { amount: rp(forecast.lowest.balance), dayInfo: forecast.lowest.day ? t("forecastDayInfo", { day: forecast.lowest.day }) : "" })}
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("forecastAssumption")}</p>
        </section>

        <section>
          <div className="mb-3 mt-4 flex items-end justify-between"><h2 className="flex items-center gap-2 font-bold"><CalendarClock size={16} className="text-primary" /> {t("upcomingObligationsTitle")}</h2>{!adding && !editingItem && <Button variant="ghost" className="h-auto p-0 text-xs text-primary" onClick={() => setAdding(true)}><Plus size={14} /> {t("addObligationBtn")}</Button>}</div>
          
          {adding && <PlannedForm onDone={() => setAdding(false)} />}
          {editingItem && <PlannedForm initial={editingItem} onDone={() => setEditingItem(null)} />}

          {!open.length && !adding && !editingItem && <p className="rounded-2xl bg-muted p-4 text-center text-xs text-muted-foreground">{t("noObligationsDesc")}</p>}
          
          <div className="mt-2 space-y-2">
            {open.map((o) => {
              const d = daysUntil(o.due);
              return (
                <div key={o.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{o.label}</p>
                      <p className={`text-[10px] ${d <= 7 ? "font-semibold text-danger" : "text-muted-foreground"}`}>{o.kind === "debt" ? t("supplierDebt") : t("scheduledExpense")} • {shortDate(o.due)} • {d < 0 ? t("overdueDays", { d: -d }) : d === 0 ? t("todayLabel") : t("daysLeft", { d })}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold">{rp(o.amount)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" className="h-9 flex-1 text-xs" onClick={() => { settlePlanned(o.id); toast.success(t("obligationSettledToast", { label: o.label })); }}><CheckCircle2 size={14} /> {t("paidBtn")}</Button>
                    <Button variant="secondary" size="icon-sm" className="size-9" aria-label={`${t("edit")} ${o.label}`} onClick={() => { setAdding(false); setEditingItem(o); }}><Pencil size={14} /></Button>
                    <Button variant="secondary" size="icon-sm" className="size-9" aria-label={`${t("delete")} ${o.label}`} onClick={() => removePlanned(o.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="flex items-center gap-2 px-1 pt-1 text-[11px] text-muted-foreground"><BadgeCheck size={14} className="shrink-0 text-primary" /> {t("calculatedFromHistory")}</p>
      </div>
    </main>
  );
}
