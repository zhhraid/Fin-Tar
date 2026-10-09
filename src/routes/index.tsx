import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Download,
  FileChartColumn,
  FileSpreadsheet,
  Globe,
  History,
  Home,
  Landmark,
  Loader2,
  LogOut,
  Plus,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Trash2,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActivityView } from "@/components/ActivityView";
import { AuthScreen } from "@/components/AuthScreen";
import { Onboarding } from "@/components/Onboarding";
import { ConsentGate } from "@/components/ConsentGate";
import { FinixChat } from "@/components/FinixChat";
import { ScanView } from "@/components/ScanView";
import { Chips, DateInput, Label, MoneyInput } from "@/components/fields";
import { signOut, startCloud, useAuth } from "@/lib/cloud";
import { csvTemplate, parseCsv, suggestCategory, type CsvResult } from "@/lib/csv";
import { exportReportPdf, exportTransactionsCsv } from "@/lib/export";
import { addTransaction, addTransactions, dateInputToIso, dateInputValue, expenseCategories, getInsights, getStatements, incomeCategories, logActivity, periodRange, periods, removeTransaction, resetLedger, rollingDays, rp, setAiConsent, summarize, updateProfile, updateTransaction, useAiConsent, useLedger, usePlanned, useProfile, type Category, type PeriodKey, type Tx } from "@/lib/financials";
import { setLanguage, useLanguage, useTranslation } from "@/lib/i18n";
import { useInstallPrompt } from "@/lib/pwa";
import { AlertCard, AlertsView, InsuranceView, LoanView } from "@/components/CopilotViews";
import finixMark from "@/assets/finix-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinTar — Keuangan Bisnis Lebih Terarah" },
      { name: "description", content: "Catat arus kas, pindai struk, dan dapatkan rekomendasi keuangan bisnis dari Finix AI." },
      { property: "og:title", content: "FinTar — Keuangan Bisnis Lebih Terarah" },
      { property: "og:description", content: "Kelola arus kas UMKM dengan pencatatan cepat dan analisis Finix AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type View = "home" | "reports" | "scan" | "finix" | "profile" | "loan" | "insurance" | "alerts" | "activity";
type Sheet = { kind: "add"; type: Tx["type"] } | { kind: "edit"; tx: Tx } | { kind: "csv" } | null;

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-muted/50 flex items-center justify-center sm:p-4 md:p-6">
    <div className="relative mx-auto h-full w-full max-w-[390px] overflow-hidden bg-card shadow-2xl sm:h-[min(820px,calc(100dvh-3rem))] sm:rounded-[2.75rem] sm:border sm:border-border/80 flex flex-col">{children}</div>
  </div>
);

function Index() {
  const [view, setView] = useState<View>("home");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [finixPrompt, setFinixPrompt] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const auth = useAuth();
  const { t } = useTranslation();
  useEffect(() => startCloud((message) => toast.error(message)), []);
  // The next person to sign in starts on Beranda, not on the screen the last one left.
  useEffect(() => {
    if (auth.status !== "signedOut") return;
    setView("home");
    setSheet(null);
    setFinixPrompt(null);
  }, [auth.status]);

  useEffect(() => {
    if (auth.status === "signedOut" || auth.status === "loading") return;
    const accountKey = auth.status === "signedIn" ? auth.email.toLowerCase() : "local";
    try {
      if (!window.localStorage.getItem(`fintar-onboarding-v1:${accountKey}`)) setShowOnboarding(true);
    } catch {
      setShowOnboarding(true);
    }
  }, [auth.status]);

  if (auth.status === "loading") return <Frame><div className="grid h-full w-full place-items-center"><Loader2 className="animate-spin text-primary" size={28} aria-label={t("loading")} /></div></Frame>;
  if (auth.status === "signedOut") return <Frame><AuthScreen /></Frame>;

  const navigate = (next: View) => {
    setView(next);
  };
  const askFinix = (prompt: string) => {
    setFinixPrompt(prompt);
    setView("finix");
  };
  const add = (type: Tx["type"]) => setSheet({ kind: "add", type });
  const completeOnboarding = () => {
    const accountKey = auth.status === "signedIn" ? auth.email.toLowerCase() : "local";
    try { window.localStorage.setItem(`fintar-onboarding-v1:${accountKey}`, "done"); } catch { /* localStorage may be unavailable */ }
    setShowOnboarding(false);
  };
  const openProfileFromOnboarding = () => {
    completeOnboarding();
    setView("profile");
  };

  return (
    <Frame>
      <div className="relative flex-1 app-scroll">
        {view === "home" && <HomeView onNavigate={navigate} onAdd={add} onEdit={(tx) => setSheet({ kind: "edit", tx })} />}
        {view === "reports" && <ReportsView onAsk={askFinix} onEdit={(tx) => setSheet({ kind: "edit", tx })} onImport={() => setSheet({ kind: "csv" })} />}
        {view === "finix" && <FinixGate><FinixChat prompt={finixPrompt} onPromptUsed={() => setFinixPrompt(null)} /></FinixGate>}
        {view === "profile" && <ProfileView onActivity={() => navigate("activity")} />}
        {view === "loan" && <LoanView onBack={() => navigate("home")} />}
        {view === "insurance" && <InsuranceView onBack={() => navigate("home")} />}
        {view === "alerts" && <AlertsView onBack={() => navigate("home")} onLoan={() => navigate("loan")} onAsk={askFinix} onEntry={() => { navigate("home"); add("income"); }} />}
        {view === "activity" && <ActivityView onBack={() => navigate("profile")} />}
      </div>
      {view === "scan" && <ScanView onClose={() => navigate("home")} onManual={() => { navigate("home"); add("expense"); }} />}
      {view !== "scan" && <BottomNav active={view} onNavigate={navigate} />}
      {sheet?.kind === "add" && <EntrySheet type={sheet.type} onClose={() => setSheet(null)} />}
      {sheet?.kind === "edit" && <EntrySheet type={sheet.tx.type} tx={sheet.tx} onClose={() => setSheet(null)} />}
      {sheet?.kind === "csv" && <CsvSheet onClose={() => setSheet(null)} />}
      {showOnboarding && <Onboarding onComplete={completeOnboarding} onOpenProfile={openProfileFromOnboarding} />}
    </Frame>
  );
}

function FinixGate({ children }: { children: ReactNode }) {
  const granted = useAiConsent();
  const { t } = useTranslation();
  if (granted) return <>{children}</>;
  return <main className="pb-6 pt-6"><ConsentGate feature={t("finixConsentFeature")}>{children}</ConsentGate></main>;
}

function HomeView({ onNavigate, onAdd, onEdit }: { onNavigate: (view: View) => void; onAdd: (type: Tx["type"]) => void; onEdit: (tx: Tx) => void }) {
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const { t, lang } = useTranslation();
  const { totals, cash } = getStatements(ledger, "month", profile, planned);
  const insights = getInsights(ledger, profile, planned);
  const top = insights[0]!;
  const healthStatusMap = {
    danger: { label: t("healthNeedAction"), cls: "bg-danger text-primary-foreground" },
    warning: { label: t("healthWarning"), cls: "bg-white/20 text-white backdrop-blur-md border border-white/20" },
    success: { label: t("healthHealthy"), cls: "bg-success text-primary-foreground" },
  };
  const status = healthStatusMap[top.level];
  const revenue30 = summarize(rollingDays(ledger, 0, 30)).revenue;
  const target = profile.target;
  const progress = target ? Math.min(100, Math.round((revenue30 / target.amount) * 100)) : 0;
  const recent = [...ledger].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <main className="pb-6">
      <header className="flex items-center justify-between px-5 pb-3.5 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-primary to-blue-500 text-primary-foreground shadow-md shadow-primary/20">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-black tracking-tight text-primary">FinTar</h1>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">AI</span>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">{t("financialAssistant")} • {profile.name}</p>
          </div>
        </div>
        <Button variant="ghost" className="relative size-10 rounded-2xl border border-border/70 bg-card p-0 shadow-sm hover:border-primary/40 hover:bg-muted" aria-label={t("cashAlertAria")} onClick={() => onNavigate("alerts")}>
          <Bell size={17} className="text-foreground/80" />
          {top.level !== "success" && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-card animate-pulse" />}
        </Button>
      </header>

      <section className="px-5 pt-1">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-blue-600 to-indigo-600 p-5 text-primary-foreground shadow-xl shadow-primary/25 border border-white/10">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -left-8 -bottom-8 size-32 rounded-full bg-indigo-400/20 blur-xl" />

          <div className="relative mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{t("currentCashBalance")}</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight drop-shadow-sm">{rp(cash)}</h2>
              <p className="mt-0.5 text-[11px] text-white/80">{t("profitThisMonth")} <span className="font-bold text-white">{rp(totals.net)}</span></p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider shadow-sm ${status.cls}`}>
              {status.label}
            </span>
          </div>

          <div className="relative grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur-md border border-white/15">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/70">{t("incomeThisMonth")}</p>
              <p className="mt-0.5 text-xs font-bold text-white">+{rp(totals.revenue)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur-md border border-white/15">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/70">{t("expenseThisMonth")}</p>
              <p className="mt-0.5 text-xs font-bold text-white">-{rp(totals.expense)}</p>
            </div>
          </div>

          <div className="relative mt-3.5 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-10 rounded-xl border border-white/30 bg-white text-xs font-bold text-primary shadow-sm hover:bg-white/95 active:scale-[0.98] transition-all" onClick={() => onAdd("income")}>
              <Plus size={15} className="text-primary" /> {t("income")}
            </Button>
            <Button className="h-10 rounded-xl border border-white/20 bg-white/15 text-xs font-bold text-white shadow-none hover:bg-white/25 active:scale-[0.98] transition-all backdrop-blur-sm" onClick={() => onAdd("expense")}>
              <span className="text-base leading-none">−</span> {t("expense")}
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2.5 px-5">
        <button onClick={() => onNavigate("loan")} className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-emerald-500/20">
            <Landmark size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">{t("applyFunding")}</p>
            <p className="truncate text-[10px] text-muted-foreground">{t("matchFinancing")}</p>
          </div>
        </button>
        <button onClick={() => onNavigate("insurance")} className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">{t("shopInsurance")}</p>
            <p className="truncate text-[10px] text-muted-foreground">{t("findProtection")}</p>
          </div>
        </button>
      </section>

      <section className="mt-5 px-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("fromYourRecords")}</h3>
          <Button variant="ghost" className="h-auto p-0 text-xs font-bold text-primary hover:bg-transparent hover:underline" onClick={() => onNavigate("alerts")}>
            {t("seeCount")} {insights.length}
          </Button>
        </div>
        <AlertCard alert={top} />
      </section>

      <section className="mt-5 px-5">
        <button onClick={() => onNavigate("finix")} className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-left text-white shadow-xl shadow-indigo-950/25 border border-indigo-500/20 transition-all hover:border-indigo-500/40 active:scale-[0.99]">
          <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/20 blur-xl" />
          <div className="relative mb-3 flex items-center gap-2.5">
            <div className="relative size-8 rounded-xl bg-card/10 p-0.5 border border-white/20">
              <img src={finixMark} alt="" width={28} height={28} className="size-full rounded-lg object-contain" />
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">{t("askFinix")}</p>
              <p className="text-[10px] text-white/60">AI Financial Copilot</p>
            </div>
            <ChevronRight className="ml-auto text-white/50 group-hover:text-white transition-colors" size={16} />
          </div>
          {target ? (
            <div className="relative">
              <p className="text-xs leading-relaxed text-white/80">{t("targetRevenue30")} <strong className="font-bold text-white">{rp(target.amount)}</strong> ({lang === "en" ? `up ${target.pct}%` : `naik ${target.pct}%`}). {lang === "en" ? `Currently ${rp(revenue30)}` : `Saat ini ${rp(revenue30)}`}.</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] font-bold text-white/70">{progress}% {t("achieved")}</span>
              </div>
            </div>
          ) : (
            <p className="relative text-xs leading-relaxed text-white/80">{t("askFinixIntro1")} <strong className="font-bold text-white">{t("askFinixIntroTarget")}</strong> {t("askFinixIntro2")}</p>
          )}
        </button>
      </section>

      <section className="mt-5 px-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("transactionHistory")}</h3>
          <Button variant="ghost" className="h-auto p-0 text-xs font-bold text-primary hover:bg-transparent hover:underline" onClick={() => onNavigate("reports")}>
            {t("seeAll")}
          </Button>
        </div>
        {ledger.length ? <TransactionList items={recent.slice(0, 3)} onSelect={onEdit} /> : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center">
            <p className="text-xs font-bold text-foreground">{t("noTransactionsYet")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("noTransactionsDesc")}</p>
            <Button variant="secondary" className="mt-3 h-9 rounded-xl text-xs font-bold" onClick={resetLedger}>{t("loadSampleData")}</Button>
          </div>
        )}
      </section>
    </main>
  );
}

function TransactionList({ items, onSelect }: { items: Tx[]; onSelect: (tx: Tx) => void }) {
  const { t, lang } = useTranslation();
  if (!items.length) return <p className="rounded-2xl bg-muted/40 border border-border/60 p-4 text-center text-xs text-muted-foreground">{t("noTransactionsInPeriod")}</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          aria-label={`${t("edit")} ${item.title}`}
          className="group flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid size-10 shrink-0 place-items-center rounded-2xl ${item.type === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
              {item.source === "scan" ? <ReceiptText size={17} /> : item.source === "csv" ? <FileSpreadsheet size={17} /> : item.type === "income" ? <TrendingUp size={17} /> : <WalletCards size={17} />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">{item.title}</p>
              <p className="text-[10px] text-muted-foreground">{item.category} • {new Date(item.date).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short" })}</p>
            </div>
          </div>
          <p className={`ml-2 shrink-0 text-xs font-black tabular-nums ${item.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
            {item.type === "income" ? "+" : "-"}{rp(item.amount)}
          </p>
        </button>
      ))}
    </div>
  );
}

function ReportsView({ onAsk, onEdit, onImport }: { onAsk: (prompt: string) => void; onEdit: (tx: Tx) => void; onImport: () => void }) {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [exporting, setExporting] = useState(false);
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const { t, lang } = useTranslation();
  const { txs, incomeStatement, totals, cashFlow, balanceSheet, cash } = getStatements(ledger, period, profile, planned);
  const range = periodRange(period);
  const periodLabel = periods.find((p) => p.key === period)!.label.toLowerCase();
  const pct = (n: number) => (totals.revenue ? `${((n / totals.revenue) * 100).toFixed(1)}%` : "0%");
  const totalAssets = balanceSheet.assets.reduce((s, i) => s + i.value, 0);
  const totalLiab = balanceSheet.liabilities.reduce((s, i) => s + i.value, 0);
  const totalEquity = balanceSheet.equity.reduce((s, i) => s + i.value, 0);
  const netCash = cashFlow.reduce((s, i) => s + i.value, 0);
  
  const periodButtonLabels: Record<PeriodKey, string> = {
    "7d": t("period7d"),
    month: t("periodMonth"),
    "3m": t("period3m"),
    year: t("periodYear"),
  };

  const incomeNote = !totals.revenue
    ? (lang === "en" ? "No income recorded in this period." : "Belum ada pemasukan di periode ini.")
    : totals.net >= 0
      ? (lang === "en" ? `You made a profit of ${rp(totals.net)}. For every Rp100 in sales, Rp${Math.round((totals.net / totals.revenue) * 100)} remains as net profit.` : `Kamu untung ${rp(totals.net)}. Dari tiap Rp100 penjualan, Rp${Math.round((totals.net / totals.revenue) * 100)} tersisa sebagai laba.`)
      : (lang === "en" ? `You incurred a loss of ${rp(-totals.net)} because expenses exceeded income.` : `Kamu rugi ${rp(-totals.net)} karena pengeluaran lebih besar dari pemasukan.`);
  const cashNote = lang === "en"
    ? `Cash inflow ${rp(totals.revenue)} and outflow ${rp(totals.expense)}, net cash ${netCash >= 0 ? "increased" : "decreased"} by ${rp(Math.abs(netCash))}.`
    : `Uang masuk ${rp(totals.revenue)} dan keluar ${rp(totals.expense)}, jadi kas ${netCash >= 0 ? "bertambah" : "berkurang"} ${rp(Math.abs(netCash))}.`;
  const balanceNote = lang === "en"
    ? `Total business assets ${rp(totalAssets)}, with ${rp(totalLiab)} in outstanding liabilities.`
    : `Total harta usahamu ${rp(totalAssets)}. ${rp(totalLiab)} di antaranya masih berupa utang.`;
  const pdf = async () => {
    setExporting(true);
    try {
      await exportReportPdf(ledger, period, profile, planned);
    } catch {
      toast.error(t("pdfGenError"));
    }
    setExporting(false);
  };
  return (
    <main className="px-5 pb-6 pt-6">
      <p className="text-xs font-bold text-primary">{t("financialReportsEyebrow")}</p>
      <h1 className="mt-1 text-2xl font-extrabold">{profile.name}</h1>
      <p className="text-xs text-muted-foreground">{t("periodLabel")} {range.label} • {txs.length} {t("transactionsCount")}</p>
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">{periods.map((p) => <button key={p.key} onClick={() => setPeriod(p.key)} className={`rounded-xl py-2 text-[11px] font-bold transition-colors ${p.key === period ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{periodButtonLabels[p.key] || p.label}</button>)}</div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Kpi label={t("kpiRevenue")} value={lang === "en" ? `${(totals.revenue / 1e6).toFixed(2)} M` : `${(totals.revenue / 1e6).toFixed(2)} jt`} />
        <Kpi label={t("kpiGrossMargin")} value={pct(totals.gross)} />
        <Kpi label={t("kpiNetMargin")} value={pct(totals.net)} accent />
      </div>

      <button onClick={() => onAsk(lang === "en" ? `Explain my financial statements for ${periodButtonLabels[period].toLowerCase()} in simple terms, and what should I improve?` : `Jelaskan laporan keuanganku untuk periode ${periodLabel} dengan bahasa sederhana, lalu apa yang perlu kuperbaiki?`)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-primary p-3 text-left transition-colors hover:bg-muted">
        <img src={finixMark} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg bg-muted object-contain" />
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold">{t("askFinixAboutReport")}</span><span className="block text-[10px] text-muted-foreground">{t("explainedEverydayLang")}</span></span>
        <ChevronRight size={16} className="shrink-0 text-primary" />
      </button>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button variant="secondary" className="h-10 px-2 text-[11px]" disabled={exporting} onClick={pdf}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {t("pdfBtn")}</Button>
        <Button variant="secondary" className="h-10 px-2 text-[11px]" disabled={!txs.length} onClick={() => exportTransactionsCsv(txs, profile)}><FileSpreadsheet size={14} /> {t("excelBtn")}</Button>
        <Button variant="secondary" className="h-10 px-2 text-[11px]" onClick={onImport}><Upload size={14} /> {t("importBtn")}</Button>
      </div>

      <Statement title={t("incomeStatementTitle")} hint={t("incomeStatementHint")} note={incomeNote} icon={<FileChartColumn size={16} />}>
        <Group label={t("kpiRevenue")}>{incomeStatement.revenue.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label={t("cogsLabel")}>{incomeStatement.cogs.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label={t("grossProfitLabel")} value={totals.gross} subtotal />
        <Group label={t("opexLabel")}>{incomeStatement.opex.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label={t("netProfitLabel")} value={totals.net} total />
      </Statement>

      <Statement title={t("cashFlowTitle")} hint={t("cashFlowHint")} note={cashNote} icon={<WalletCards size={16} />}>
        {cashFlow.map((c) => <Line key={c.label} label={c.label} value={c.value} />)}
        <Line label={t("netCashIncrease")} value={netCash} subtotal />
        <Line label={t("endingCashBalance")} value={cash} total />
      </Statement>

      <Statement title={t("balanceSheetTitle")} hint={t("balanceSheetHint")} note={balanceNote} icon={<Landmark size={16} />}>
        <Group label={t("assetsLabel")}>{balanceSheet.assets.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label={t("totalAssetsLabel")} value={totalAssets} subtotal />
        <Group label={t("liabilitiesLabel")}>{balanceSheet.liabilities.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label={t("equityLabel")}>{balanceSheet.equity.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label={t("totalLiabEquityLabel")} value={totalLiab + totalEquity} total />
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("balanceSheetFootnote")}</p>
      </Statement>

      <h2 className="mb-1 mt-7 font-bold">{t("periodTransactionsTitle")}</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">{t("tapToEditNote")}</p>
      <TransactionList onSelect={onEdit} items={[...txs].sort((a, b) => b.date.localeCompare(a.date))} />
    </main>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl p-3 ${accent ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className={`text-[10px] font-semibold ${accent ? "opacity-75" : "text-muted-foreground"}`}>{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>;
}

function Statement({ title, hint, note, icon, children }: { title: string; hint: string; note: string; icon: ReactNode; children: ReactNode }) {
  return <section className="mt-5 rounded-3xl border border-border p-5"><h2 className="flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary">{icon}</span>{title}</h2><p className="mt-1 text-[10px] text-muted-foreground">{hint}</p><p className="mb-3 mt-3 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed">{note}</p><div className="space-y-1">{children}</div></section>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pt-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>{children}</div>;
}

function Line({ label, value, subtotal = false, total = false }: { label: string; value: number; subtotal?: boolean; total?: boolean }) {
  const cls = total ? "mt-2 border-t-2 border-foreground pt-2 text-sm font-extrabold" : subtotal ? "mt-1 border-t border-border pt-2 text-sm font-bold" : "text-xs";
  const color = total ? (value >= 0 ? "text-success" : "text-danger") : value < 0 ? "text-danger" : "";
  return <div className={`flex justify-between gap-4 py-0.5 ${cls}`}><span className={total || subtotal ? "" : "text-muted-foreground"}>{label}</span><span className={`shrink-0 tabular-nums ${color}`}>{value < 0 ? `(${rp(-value)})` : rp(value)}</span></div>;
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) { return <div className={`flex justify-between gap-4 text-sm ${bold ? "font-bold" : ""}`}><span className="text-muted-foreground">{label}</span><span className="shrink-0">{value}</span></div>; }

const textField = "h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20";

function ProfileView({ onActivity }: { onActivity: () => void }) {
  const profile = useProfile();
  const [draft, setDraft] = useState(profile);
  const ledger = useLedger();
  const auth = useAuth();
  const consent = useAiConsent();
  const install = useInstallPrompt();
  const { t, lang } = useTranslation();
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  useEffect(() => {
    if (!dirty) setDraft(profile);
  }, [profile, dirty]);

  const saveProfile = () => {
    if (!dirty) return;
    if (window.confirm(lang === "en" ? "Save these profile changes?" : "Simpan perubahan profil ini?")) {
      updateProfile(draft);
      toast.success(lang === "en" ? "Profile saved" : "Profil tersimpan");
    }
  };

  const initials = profile.name
    ? profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <main className="pb-8 pt-0">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-blue-600 to-indigo-600 px-5 pb-8 pt-10">
        <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-6 bottom-0 size-28 rounded-full bg-indigo-400/15 blur-xl" />
        <div className="relative flex items-end gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl font-black text-white shadow-md ring-2 ring-white/30 backdrop-blur-sm">
            {initials}
          </div>
          <div className="pb-0.5 min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">FinTar Lite</p>
            <h1 className="mt-0.5 truncate text-xl font-black tracking-tight text-white">{profile.name || t("myBusiness")}</h1>
            <p className="mt-0.5 text-[11px] text-white/75">{profile.category || "—"}</p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm border border-white/15">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/65">{t("transactionsRecorded")}</p>
            <p className="mt-0.5 text-base font-black text-white">{ledger.length}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm border border-white/15">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/65">{auth.status === "signedIn" ? "Cloud Sync" : "Mode"}</p>
            <p className="mt-0.5 text-sm font-black text-white">{auth.status === "signedIn" ? "✓ Aktif" : t("deviceMode")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 pt-5">
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/95 px-3 py-2 shadow-sm backdrop-blur-xl">
          <p className="text-[11px] font-semibold text-muted-foreground">{dirty ? (lang === "en" ? "Unsaved changes" : "Ada perubahan yang belum disimpan") : (lang === "en" ? "All changes saved" : "Semua perubahan tersimpan")}</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" className="h-8 rounded-lg px-2.5 text-[11px]" disabled={!dirty} onClick={() => setDraft(profile)}>{t("cancel")}</Button>
            <Button type="button" className="h-8 rounded-lg px-3 text-[11px]" disabled={!dirty} onClick={saveProfile}>{t("save")}</Button>
          </div>
        </div>
        {/* Account */}
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {auth.status === "signedIn" ? <Cloud size={17} /> : <Smartphone size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{auth.status === "signedIn" ? auth.email : t("deviceMode")}</p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{auth.status === "signedIn" ? t("cloudSyncedDesc") : t("deviceOnlyDesc")}</p>
          </div>
          {auth.status === "signedIn" && (
            <Button variant="secondary" className="h-8 shrink-0 px-2.5 text-[11px] rounded-lg" onClick={() => void signOut()}>
              <LogOut size={13} /> {t("signOutBtn")}
            </Button>
          )}
        </div>

        {/* Business Profile */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("businessProfileCard")}</p>
          <div className="space-y-3">
            <div>
              <Label>{t("businessNameLabel")}</Label>
              <input aria-label={t("businessNameLabel")} value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={textField} placeholder={t("businessNamePlaceholder")} />
            </div>
            <div>
              <Label>{t("businessCategoryLabel")}</Label>
              <input aria-label={t("businessCategoryLabel")} value={draft.category} maxLength={40} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={textField} placeholder={t("businessCategoryPlaceholder")} />
            </div>
          </div>
        </div>

        {/* Opening Balances */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("openingBalanceSection")}</p>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">{t("openingBalanceDesc")}</p>
          <div className="space-y-3">
            <div><Label>{t("openingCashLabel")}</Label><MoneyInput label={t("openingCashLabel")} value={draft.openingCash} onChange={(n) => setDraft({ ...draft, openingCash: n })} /></div>
            <div><Label>{t("inventoryLabel")}</Label><MoneyInput label={t("inventoryLabel")} value={draft.inventory} onChange={(n) => setDraft({ ...draft, inventory: n })} /></div>
            <div><Label>{t("equipmentLabel")}</Label><MoneyInput label={t("equipmentLabel")} value={draft.equipment} onChange={(n) => setDraft({ ...draft, equipment: n })} /></div>
          </div>
        </div>

        {/* Revenue Target */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("revenueTargetSection")}</p>
          {draft.target ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-foreground">{rp(draft.target.amount)}</p>
                <p className="text-[10px] text-muted-foreground">{t("targetIncreaseLabel")} {draft.target.pct}%</p>
              </div>
              <button className="rounded-lg bg-danger-soft/80 px-2.5 py-1.5 text-[11px] font-bold text-danger" onClick={() => setDraft({ ...draft, target: null })}>{t("deleteTargetBtn")}</button>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("noTargetDesc")}</p>
          )}
        </div>

        {/* Language */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("appLanguageSection")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setLanguage("id")} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-bold transition-all ${lang === "id" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
              🇮🇩 Bahasa Indonesia
            </button>
            <button type="button" onClick={() => setLanguage("en")} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-bold transition-all ${lang === "en" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
              🇬🇧 English
            </button>
          </div>
        </div>

        {/* Privacy & AI */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("privacyAiSection")}</p>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-xs font-bold">{t("aiConsentLabel")}</span>
              <span className="block text-[10px] leading-relaxed text-muted-foreground">{t("aiConsentHelp")}</span>
            </span>
            <input type="checkbox" role="switch" aria-label={t("aiConsentLabel")} checked={consent} onChange={(e) => setAiConsent(e.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" />
          </label>
          <button onClick={onActivity} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40">
            <History size={15} className="shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block text-xs font-bold">{t("activityLogLabel")}</span>
              <span className="block text-[10px] text-muted-foreground">{t("activityLogHelp")}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          </button>
        </div>

        {/* App */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("appSection")}</p>
          <div className="space-y-2">
            {install ? (
              <Button className="h-10 w-full text-xs rounded-xl" onClick={install}><Download size={14} /> {t("installPwaBtn")}</Button>
            ) : (
              <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">{t("installPwaHelp")}</p>
            )}
            <Button variant="secondary" className="h-10 w-full text-xs rounded-xl" onClick={() => { if (window.confirm(t("resetSampleConfirmMsg"))) resetLedger(); }}>{t("loadSampleData")}</Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function SheetFrame({ eyebrow, eyebrowClass = "text-primary", title, onClose, children }: { eyebrow: string; eyebrowClass?: string; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return <div className="absolute inset-0 z-50 flex items-end bg-foreground/30 backdrop-blur-sm"><div className="max-h-full w-full overflow-y-auto rounded-t-[2rem] bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className={`text-xs font-bold ${eyebrowClass}`}>{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold">{title}</h2></div><Button variant="icon" className="size-10 rounded-full p-0" onClick={onClose} aria-label={t("close")}><X size={18}/></Button></div>{children}</div></div>;
}

function EntrySheet({ type, tx, onClose }: { type: Tx["type"]; tx?: Tx; onClose: () => void }) {
  const income = type === "income";
  const cats = income ? incomeCategories : expenseCategories;
  const { t } = useTranslation();
  const [value, setValue] = useState(tx?.amount ?? 0);
  const [title, setTitle] = useState(tx?.title ?? "");
  const [category, setCategory] = useState<Category>(tx?.category ?? cats[0]!);
  // Until the user picks a category, it follows what the description suggests.
  const [picked, setPicked] = useState(Boolean(tx));
  const [date, setDate] = useState(() => (tx ? dateInputValue(new Date(tx.date)) : dateInputValue()));
  const changeTitle = (next: string) => {
    setTitle(next);
    if (!picked) setCategory(suggestCategory(next, type) ?? cats[0]!);
  };
  const save = () => {
    if (!value) return;
    const fields = { title: title.trim().slice(0, 80) || category, amount: value, category };
    if (tx) updateTransaction(tx.id, { ...fields, ...(date === dateInputValue(new Date(tx.date)) ? {} : { date: dateInputToIso(date) }) });
    else addTransaction({ ...fields, type, source: "manual", date: dateInputToIso(date) });
    onClose();
  };
  return (
    <SheetFrame eyebrow={income ? t("incomeEyebrow") : t("expenseEyebrow")} eyebrowClass={income ? "text-success" : "text-danger"} title={tx ? t("editTxTitle") : t("addTxTitle")} onClose={onClose}>
      <Label>{t("amountLabel")}</Label><MoneyInput large autoFocus={!tx} label={t("amountLabel")} value={value} onChange={setValue} />
      <Label>{t("notesLabel")}</Label><input aria-label={t("notesLabel")} value={title} onChange={(e) => changeTitle(e.target.value)} maxLength={80} className={textField} placeholder={income ? t("incomeNotesPlaceholder") : t("expenseNotesPlaceholder")}/>
      <Label>{t("categoryLabel")}</Label><Chips options={cats} value={category} onChange={(c) => { setCategory(c); setPicked(true); }} />
      <Label>{t("dateLabel")}</Label><DateInput value={date} onChange={setDate} />
      <Button className="mt-6 h-12 w-full" disabled={!value} onClick={save}>{tx ? t("saveChangesBtn") : t("saveTxBtn")}</Button>
      {tx && <Button variant="ghost" className="mt-2 h-11 w-full text-xs text-danger hover:text-danger" onClick={() => { removeTransaction(tx.id); onClose(); }}><Trash2 size={15} /> {t("deleteTxBtn")}</Button>}
    </SheetFrame>
  );
}

function CsvSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const { t, lang } = useTranslation();
  const result: CsvResult | null = text.trim() ? parseCsv(text) : null;
  const run = () => {
    if (!result?.rows.length) return;
    const n = addTransactions(result.rows);
    logActivity({ tool: "import_csv", tier: "T2", status: "approved", summary: `${n} transaksi diimpor dari CSV${result.errors.length ? `, ${result.errors.length} baris dilewati` : ""}` });
    toast.success(t("importSuccessToast", { n }));
    onClose();
  };
  return (
    <SheetFrame eyebrow={t("importCsvEyebrow")} title={t("importCsvTitle")} onClose={onClose}>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("importCsvDesc")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"><Upload size={15} /> {t("chooseFileBtn")}<input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></label>
        <Button variant="secondary" className="h-11 text-xs" onClick={() => setText(csvTemplate)}>{t("viewExampleBtn")}</Button>
      </div>
      <textarea aria-label={t("csvTextareaAria")} value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-3 w-full rounded-2xl border border-border bg-transparent p-3 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring" placeholder={"tanggal;jenis;jumlah;kategori;keterangan\n09/10/2026;pemasukan;320.000;Penjualan;Roti manis pagi"} />
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="rounded-xl bg-success-soft px-3 py-2 font-semibold text-success">{result.rows.length} {t("readyToImport")}{result.rows.length ? `, total ${rp(result.rows.reduce((s, r) => s + r.amount, 0))}` : ""}.</p>
          {result.errors.length > 0 && (
            <div className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
              <p className="font-semibold">{result.errors.length} {t("rowsSkipped")}:</p>
              <ul className="mt-1 space-y-0.5">{result.errors.slice(0, 5).map((e) => <li key={e.line}>{lang === "en" ? `Line ${e.line}: ` : `Baris ${e.line}: `}{e.reason}</li>)}{result.errors.length > 5 && <li>{t("andMoreRows", { n: result.errors.length - 5 })}</li>}</ul>
            </div>
          )}
        </div>
      )}
      <Button className="mt-5 h-12 w-full" disabled={!result?.rows.length} onClick={run}>{t("importTxBtn")} {result?.rows.length ? `${result.rows.length} ${t("transactionsCount")}` : ""}</Button>
    </SheetFrame>
  );
}

function BottomNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  const { t } = useTranslation();
  const homeItem = { view: "home" as View, label: t("navHome"), icon: <Home size={18} /> };
  const reportsItem = { view: "reports" as View, label: t("navReports"), icon: <FileChartColumn size={18} /> };
  const finixItem = { view: "finix" as View, label: t("navAssistant"), icon: <Bot size={18} /> };
  const profileItem = { view: "profile" as View, label: t("navProfile"), icon: <CircleUserRound size={18} /> };
  return (
    <nav className="relative z-40 flex h-16 shrink-0 items-center justify-around border-t border-border/70 bg-card/95 px-3 backdrop-blur-xl shadow-lg pb-[env(safe-area-inset-bottom,0px)]">
      <NavButton item={homeItem} active={active} onNavigate={onNavigate}/>
      <NavButton item={reportsItem} active={active} onNavigate={onNavigate}/>
      <Button
        className="-mt-6 flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-blue-500 text-white p-0 shadow-lg shadow-primary/30 ring-4 ring-card hover:scale-105 active:scale-95 transition-all"
        onClick={() => onNavigate("scan")}
        aria-label={t("scanReceiptLabel")}
      >
        <Camera size={21}/>
      </Button>
      <NavButton item={finixItem} active={active} onNavigate={onNavigate}/>
      <NavButton item={profileItem} active={active} onNavigate={onNavigate}/>
    </nav>
  );
}

function NavButton({ item, active, onNavigate }: { item: {view: View; label: string; icon: ReactNode}; active: View; onNavigate: (view: View) => void }) {
  const selected = active === item.view;
  return (
    <Button
      variant="ghost"
      className={`h-12 w-12 flex-col gap-0.5 rounded-xl p-0 text-[10px] transition-all hover:bg-transparent ${selected ? "font-bold text-primary" : "text-muted-foreground hover:text-foreground"}`}
      onClick={() => onNavigate(item.view)}
    >
      {item.icon}
      <span className="leading-none">{item.label}</span>
    </Button>
  );
}
