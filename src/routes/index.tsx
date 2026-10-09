import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Camera,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Download,
  FileChartColumn,
  FileSpreadsheet,
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
import { ConsentGate } from "@/components/ConsentGate";
import { FinixChat } from "@/components/FinixChat";
import { ScanView } from "@/components/ScanView";
import { Chips, DateInput, Label, MoneyInput } from "@/components/fields";
import { signOut, startCloud, useAuth } from "@/lib/cloud";
import { csvTemplate, parseCsv, suggestCategory, type CsvResult } from "@/lib/csv";
import { exportReportPdf, exportTransactionsCsv } from "@/lib/export";
import { addTransaction, addTransactions, dateInputToIso, dateInputValue, expenseCategories, getInsights, getStatements, incomeCategories, logActivity, periodRange, periods, removeTransaction, resetLedger, rollingDays, rp, setAiConsent, summarize, updateProfile, updateTransaction, useAiConsent, useLedger, usePlanned, useProfile, type Category, type PeriodKey, type Tx } from "@/lib/financials";
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
  <div className="min-h-screen bg-background px-0 sm:px-6 sm:py-8">
    <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-card shadow-2xl sm:min-h-[880px] sm:rounded-[2rem] sm:border sm:border-border">{children}</div>
  </div>
);

function Index() {
  const [view, setView] = useState<View>("home");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [finixPrompt, setFinixPrompt] = useState<string | null>(null);
  const auth = useAuth();
  useEffect(() => startCloud((message) => toast.error(message)), []);
  // The next person to sign in starts on Beranda, not on the screen the last one left.
  useEffect(() => {
    if (auth.status !== "signedOut") return;
    setView("home");
    setSheet(null);
    setFinixPrompt(null);
  }, [auth.status]);

  if (auth.status === "loading") return <Frame><div className="grid min-h-screen place-items-center sm:min-h-[880px]"><Loader2 className="animate-spin text-primary" size={28} aria-label="Memuat" /></div></Frame>;
  if (auth.status === "signedOut") return <Frame><AuthScreen /></Frame>;

  const navigate = (next: View) => {
    setView(next);
  };
  const askFinix = (prompt: string) => {
    setFinixPrompt(prompt);
    setView("finix");
  };
  const add = (type: Tx["type"]) => setSheet({ kind: "add", type });

  return (
    <Frame>
      {view === "home" && <HomeView onNavigate={navigate} onAdd={add} onEdit={(tx) => setSheet({ kind: "edit", tx })} />}
      {view === "reports" && <ReportsView onAsk={askFinix} onEdit={(tx) => setSheet({ kind: "edit", tx })} onImport={() => setSheet({ kind: "csv" })} />}
      {view === "scan" && <ScanView onClose={() => navigate("home")} onManual={() => { navigate("home"); add("expense"); }} />}
      {view === "finix" && <FinixGate><FinixChat prompt={finixPrompt} onPromptUsed={() => setFinixPrompt(null)} /></FinixGate>}
      {view === "profile" && <ProfileView onActivity={() => navigate("activity")} />}
      {view === "loan" && <LoanView onBack={() => navigate("home")} />}
      {view === "insurance" && <InsuranceView onBack={() => navigate("home")} />}
      {view === "alerts" && <AlertsView onBack={() => navigate("home")} onLoan={() => navigate("loan")} onAsk={askFinix} onEntry={() => { navigate("home"); add("income"); }} />}
      {view === "activity" && <ActivityView onBack={() => navigate("profile")} />}
      {view !== "scan" && <BottomNav active={view} onNavigate={navigate} />}
      {sheet?.kind === "add" && <EntrySheet type={sheet.type} onClose={() => setSheet(null)} />}
      {sheet?.kind === "edit" && <EntrySheet type={sheet.tx.type} tx={sheet.tx} onClose={() => setSheet(null)} />}
      {sheet?.kind === "csv" && <CsvSheet onClose={() => setSheet(null)} />}
    </Frame>
  );
}

function FinixGate({ children }: { children: ReactNode }) {
  const granted = useAiConsent();
  if (granted) return <>{children}</>;
  return <main className="min-h-screen pb-28 pt-8"><ConsentGate feature="menjawab pertanyaanmu">{children}</ConsentGate></main>;
}

const health = {
  danger: { label: "Perlu tindakan", cls: "bg-danger text-primary-foreground" },
  warning: { label: "Waspada", cls: "bg-primary-foreground text-primary" },
  success: { label: "Sehat", cls: "bg-success text-primary-foreground" },
};

function HomeView({ onNavigate, onAdd, onEdit }: { onNavigate: (view: View) => void; onAdd: (type: Tx["type"]) => void; onEdit: (tx: Tx) => void }) {
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const { totals, cash } = getStatements(ledger, "month", profile, planned);
  const insights = getInsights(ledger, profile, planned);
  const top = insights[0]!;
  const status = health[top.level];
  const revenue30 = summarize(rollingDays(ledger, 0, 30)).revenue;
  const target = profile.target;
  const progress = target ? Math.min(100, Math.round((revenue30 / target.amount) * 100)) : 0;
  const recent = [...ledger].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <main className="pb-28">
      <header className="flex items-center justify-between px-5 pb-4 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp size={19} /></div>
            <h1 className="text-xl font-extrabold text-primary">FinTar</h1>
          </div>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">Asisten keuangan • {profile.name}</p>
        </div>
        <Button variant="icon" className="relative size-10 rounded-full p-0" aria-label="Peringatan kas" onClick={() => onNavigate("alerts")}>
          <Bell size={18} />
          {top.level !== "success" && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-muted" />}
        </Button>
      </header>

      <section className="px-5 pt-2">
        <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/20">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-medium opacity-75">Saldo kas saat ini</p><h2 className="mt-1 text-3xl font-bold">{rp(cash)}</h2><p className="mt-1 text-[11px] opacity-75">Laba bulan ini {rp(totals.net)}</p></div>
            <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase ${status.cls}`}>{status.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="text-[10px] uppercase opacity-70">Pemasukan bulan ini</p><p className="mt-1 text-sm font-bold">+{rp(totals.revenue)}</p></div>
            <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="text-[10px] uppercase opacity-70">Pengeluaran bulan ini</p><p className="mt-1 text-sm font-bold">-{rp(totals.expense)}</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11 border-primary-foreground/20 bg-primary-foreground text-xs text-primary" onClick={() => onAdd("income")}><Plus size={15} /> Pemasukan</Button>
            <Button className="h-11 border border-primary-foreground/30 bg-primary text-xs shadow-none hover:bg-primary" onClick={() => onAdd("expense")}><span className="text-lg leading-none">−</span> Pengeluaran</Button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <button onClick={() => onNavigate("loan")} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><Landmark size={19} /></div><div><p className="text-xs font-bold">Ajukan Modal</p><p className="text-[10px] text-muted-foreground">Cocokkan pembiayaan</p></div></button>
        <button onClick={() => onNavigate("insurance")} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary"><ShieldCheck size={19} /></div><div><p className="text-xs font-bold">Asuransi Toko</p><p className="text-[10px] text-muted-foreground">Cari perlindungan</p></div></button>
      </section>

      <section className="mt-6 px-5">
        <div className="mb-3 flex items-end justify-between"><h3 className="font-bold">Dari catatanmu</h3><Button variant="ghost" className="h-auto p-0 text-xs text-primary" onClick={() => onNavigate("alerts")}>Lihat {insights.length}</Button></div>
        <AlertCard alert={top} />
      </section>

      <section className="mt-6 px-5">
        <button onClick={() => onNavigate("finix")} className="relative w-full overflow-hidden rounded-3xl bg-brand-dark p-6 text-left text-brand-dark-foreground transition-transform active:scale-[0.99]">
          <div className="mb-4 flex items-center gap-2"><img src={finixMark} alt="" width={28} height={28} className="size-7 rounded-lg bg-card object-contain" /><p className="text-sm font-bold">Tanya Finix</p><ChevronRight className="ml-auto" size={18} /></div>
          {target ? (
            <>
              <p className="text-sm leading-relaxed opacity-80">Target omzet 30 hari <strong className="text-brand-dark-foreground">{rp(target.amount)}</strong> (naik {target.pct}%). Saat ini {rp(revenue30)}.</p>
              <div className="mt-5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card/10"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div><span className="text-[10px] opacity-60">{progress}% tercapai</span></div>
            </>
          ) : (
            <p className="text-sm leading-relaxed opacity-80">Tanya kondisi keuanganmu, atau pasang target seperti <strong className="text-brand-dark-foreground">"bulan depan naik 20%"</strong> dan Finix bantu susun langkahnya.</p>
          )}
        </button>
      </section>

      <section className="mt-7 px-5">
        <div className="mb-3 flex items-end justify-between"><h3 className="font-bold">Riwayat transaksi</h3><Button variant="ghost" className="h-auto p-0 text-xs text-primary" onClick={() => onNavigate("reports")}>Lihat Semua</Button></div>
        {ledger.length ? <TransactionList items={recent.slice(0, 3)} onSelect={onEdit} /> : (
          <div className="rounded-2xl bg-muted p-5 text-center">
            <p className="text-sm font-bold">Belum ada transaksi</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Catat pemasukan pertamamu, atau coba dulu dengan data contoh toko roti.</p>
            <Button variant="secondary" className="mt-3 h-10 text-xs" onClick={resetLedger}>Muat data contoh</Button>
          </div>
        )}
      </section>
    </main>
  );
}

function TransactionList({ items, onSelect }: { items: Tx[]; onSelect: (tx: Tx) => void }) {
  if (!items.length) return <p className="rounded-2xl bg-muted p-4 text-center text-xs text-muted-foreground">Belum ada transaksi di periode ini.</p>;
  return <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} aria-label={`Ubah ${item.title}`} className="flex w-full items-center justify-between rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary"><div className="flex min-w-0 items-center gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.type === "income" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{item.source === "scan" ? <ReceiptText size={17} /> : item.source === "csv" ? <FileSpreadsheet size={17} /> : item.type === "income" ? <TrendingUp size={17} /> : <WalletCards size={17} />}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.category} • {new Date(item.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p></div></div><p className={`ml-2 shrink-0 text-sm font-bold ${item.type === "income" ? "text-success" : "text-danger"}`}>{item.type === "income" ? "+" : "-"}{rp(item.amount)}</p></button>)}</div>;
}

function ReportsView({ onAsk, onEdit, onImport }: { onAsk: (prompt: string) => void; onEdit: (tx: Tx) => void; onImport: () => void }) {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [exporting, setExporting] = useState(false);
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const { txs, incomeStatement, totals, cashFlow, balanceSheet, cash } = getStatements(ledger, period, profile, planned);
  const range = periodRange(period);
  const periodLabel = periods.find((p) => p.key === period)!.label.toLowerCase();
  const pct = (n: number) => (totals.revenue ? `${((n / totals.revenue) * 100).toFixed(1)}%` : "0%");
  const totalAssets = balanceSheet.assets.reduce((s, i) => s + i.value, 0);
  const totalLiab = balanceSheet.liabilities.reduce((s, i) => s + i.value, 0);
  const totalEquity = balanceSheet.equity.reduce((s, i) => s + i.value, 0);
  const netCash = cashFlow.reduce((s, i) => s + i.value, 0);
  const incomeNote = !totals.revenue
    ? "Belum ada pemasukan di periode ini."
    : totals.net >= 0
      ? `Kamu untung ${rp(totals.net)}. Dari tiap Rp100 penjualan, Rp${Math.round((totals.net / totals.revenue) * 100)} tersisa sebagai laba.`
      : `Kamu rugi ${rp(-totals.net)} karena pengeluaran lebih besar dari pemasukan.`;
  const cashNote = `Uang masuk ${rp(totals.revenue)} dan keluar ${rp(totals.expense)}, jadi kas ${netCash >= 0 ? "bertambah" : "berkurang"} ${rp(Math.abs(netCash))}.`;
  const balanceNote = `Total harta usahamu ${rp(totalAssets)}. ${rp(totalLiab)} di antaranya masih berupa utang.`;
  const pdf = async () => {
    setExporting(true);
    try {
      await exportReportPdf(ledger, period, profile, planned);
    } catch {
      toast.error("Gagal membuat PDF. Coba lagi.");
    }
    setExporting(false);
  };
  return (
    <main className="min-h-screen px-5 pb-28 pt-7">
      <p className="text-xs font-bold text-primary">LAPORAN KEUANGAN</p>
      <h1 className="mt-1 text-2xl font-extrabold">{profile.name}</h1>
      <p className="text-xs text-muted-foreground">Periode {range.label} • {txs.length} transaksi</p>
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">{periods.map((p) => <button key={p.key} onClick={() => setPeriod(p.key)} className={`rounded-xl py-2 text-[11px] font-bold transition-colors ${p.key === period ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{p.label}</button>)}</div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Kpi label="Pendapatan" value={`${(totals.revenue / 1e6).toFixed(2)} jt`} />
        <Kpi label="Margin kotor" value={pct(totals.gross)} />
        <Kpi label="Margin bersih" value={pct(totals.net)} accent />
      </div>

      <button onClick={() => onAsk(`Jelaskan laporan keuanganku untuk periode ${periodLabel} dengan bahasa sederhana, lalu apa yang perlu kuperbaiki?`)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-primary p-3 text-left transition-colors hover:bg-muted">
        <img src={finixMark} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg bg-muted object-contain" />
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold">Tanya Finix soal laporan ini</span><span className="block text-[10px] text-muted-foreground">Dijelaskan dengan bahasa sehari-hari</span></span>
        <ChevronRight size={16} className="shrink-0 text-primary" />
      </button>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button variant="secondary" className="h-10 px-2 text-[11px]" disabled={exporting} onClick={pdf}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF</Button>
        <Button variant="secondary" className="h-10 px-2 text-[11px]" disabled={!txs.length} onClick={() => exportTransactionsCsv(txs, profile)}><FileSpreadsheet size={14} /> Excel/CSV</Button>
        <Button variant="secondary" className="h-10 px-2 text-[11px]" onClick={onImport}><Upload size={14} /> Impor</Button>
      </div>

      <Statement title="Laporan Laba Rugi" hint="Untung atau rugi dari kegiatan jualan." note={incomeNote} icon={<FileChartColumn size={16} />}>
        <Group label="Pendapatan">{incomeStatement.revenue.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label="Harga pokok penjualan">{incomeStatement.cogs.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label="Laba kotor" value={totals.gross} subtotal />
        <Group label="Beban operasional">{incomeStatement.opex.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label="Laba bersih" value={totals.net} total />
      </Statement>

      <Statement title="Laporan Arus Kas" hint="Uang yang benar-benar masuk dan keluar." note={cashNote} icon={<WalletCards size={16} />}>
        {cashFlow.map((c) => <Line key={c.label} label={c.label} value={c.value} />)}
        <Line label="Kenaikan kas bersih" value={netCash} subtotal />
        <Line label="Saldo kas akhir" value={cash} total />
      </Statement>

      <Statement title="Neraca Ringkas" hint="Harta, utang, dan modal usaha saat ini." note={balanceNote} icon={<Landmark size={16} />}>
        <Group label="Aset">{balanceSheet.assets.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label="Total aset" value={totalAssets} subtotal />
        <Group label="Kewajiban">{balanceSheet.liabilities.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label="Ekuitas">{balanceSheet.equity.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label="Total kewajiban + ekuitas" value={totalLiab + totalEquity} total />
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Persediaan dan peralatan diisi di Profil. Utang diambil dari daftar kewajiban di menu Peringatan.</p>
      </Statement>

      <h2 className="mb-1 mt-7 font-bold">Transaksi periode ini</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">Ketuk transaksi untuk mengubah atau menghapusnya.</p>
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

const textField = "h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring";

function ProfileView({ onActivity }: { onActivity: () => void }) {
  const profile = useProfile();
  const ledger = useLedger();
  const auth = useAuth();
  const consent = useAiConsent();
  const install = useInstallPrompt();
  const opening = [
    { key: "openingCash", label: "Kas awal sebelum mencatat" },
    { key: "inventory", label: "Nilai persediaan bahan" },
    { key: "equipment", label: "Nilai peralatan usaha" },
  ] as const;
  return (
    <main className="min-h-screen px-5 pb-28 pt-10">
      <div className="text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-muted text-primary"><CircleUserRound size={40} /></div>
        <h1 className="mt-3 text-2xl font-extrabold">{profile.name || "Usahaku"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Paket Lite • {ledger.length} transaksi tercatat</p>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-muted p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-primary">{auth.status === "signedIn" ? <Cloud size={17} /> : <Smartphone size={17} />}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{auth.status === "signedIn" ? auth.email : "Mode perangkat"}</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">{auth.status === "signedIn" ? "Data tersimpan di akunmu dan bisa dibuka dari HP lain." : "Data hanya tersimpan di perangkat ini."}</p>
        </div>
        {auth.status === "signedIn" && <Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={() => void signOut()}><LogOut size={14} /> Keluar</Button>}
      </div>

      <Label>Nama usaha</Label>
      <input aria-label="Nama usaha" value={profile.name} maxLength={40} onChange={(e) => updateProfile({ name: e.target.value })} className={textField} placeholder="Contoh: Viera Bakery" />
      <Label>Kategori usaha</Label>
      <input aria-label="Kategori usaha" value={profile.category} maxLength={40} onChange={(e) => updateProfile({ category: e.target.value })} className={textField} placeholder="Contoh: Makanan" />

      <h2 className="mt-8 font-bold">Saldo awal untuk neraca</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Isi sesuai kondisi usahamu supaya neraca dan saldo kas akurat.</p>
      {opening.map((f) => (
        <div key={f.key}><Label>{f.label}</Label><MoneyInput label={f.label} value={profile[f.key]} onChange={(n) => updateProfile({ [f.key]: n })} /></div>
      ))}

      <h2 className="mt-8 font-bold">Target omzet</h2>
      <div className="mt-3 space-y-3 rounded-2xl bg-muted p-4">
        {profile.target ? (
          <>
            <Row label="Target 30 hari" value={rp(profile.target.amount)} bold />
            <Row label="Kenaikan" value={`${profile.target.pct}%`} />
            <button className="text-xs font-bold text-danger" onClick={() => updateProfile({ target: null })}>Hapus target</button>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">Belum ada target. Pasang lewat tombol "Pasang target" di Finix.</p>
        )}
      </div>

      <h2 className="mt-8 font-bold">Privasi & AI</h2>
      <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
        <span><span className="block text-xs font-bold">Izinkan AI memproses catatanku</span><span className="block text-[10px] leading-relaxed text-muted-foreground">Dipakai Finix dan pemindai struk. Bisa dicabut kapan saja.</span></span>
        <input type="checkbox" role="switch" aria-label="Izinkan AI memproses catatanku" checked={consent} onChange={(e) => setAiConsent(e.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" />
      </label>
      <button onClick={onActivity} className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary">
        <History size={17} className="shrink-0 text-primary" />
        <span className="flex-1"><span className="block text-xs font-bold">Log aktivitas & hapus data</span><span className="block text-[10px] text-muted-foreground">Lihat jejak AI, unduh log, atau hapus semua datamu</span></span>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
      </button>

      <h2 className="mt-8 font-bold">Aplikasi</h2>
      <div className="mt-3 space-y-2">
        {install ? <Button className="h-11 w-full text-xs" onClick={install}><Download size={15} /> Pasang FinTar di layar utama</Button> : <p className="rounded-2xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">Untuk memasang FinTar seperti aplikasi, buka menu browser lalu pilih "Tambahkan ke layar utama".</p>}
        <Button variant="secondary" className="h-11 w-full text-xs" onClick={() => { if (window.confirm("Ganti semua transaksi dan kewajiban dengan data contoh? Catatanmu saat ini akan hilang.")) resetLedger(); }}>Muat data contoh</Button>
      </div>
    </main>
  );
}

function SheetFrame({ eyebrow, eyebrowClass = "text-primary", title, onClose, children }: { eyebrow: string; eyebrowClass?: string; title: string; onClose: () => void; children: ReactNode }) {
  return <div className="absolute inset-0 z-50 flex items-end bg-foreground/30 backdrop-blur-sm"><div className="max-h-full w-full overflow-y-auto rounded-t-[2rem] bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className={`text-xs font-bold ${eyebrowClass}`}>{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold">{title}</h2></div><Button variant="icon" className="size-10 rounded-full p-0" onClick={onClose} aria-label="Tutup"><X size={18}/></Button></div>{children}</div></div>;
}

function EntrySheet({ type, tx, onClose }: { type: Tx["type"]; tx?: Tx; onClose: () => void }) {
  const income = type === "income";
  const cats = income ? incomeCategories : expenseCategories;
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
    <SheetFrame eyebrow={income ? "PEMASUKAN" : "PENGELUARAN"} eyebrowClass={income ? "text-success" : "text-danger"} title={tx ? "Ubah transaksi" : "Tambah transaksi"} onClose={onClose}>
      <Label>Jumlah</Label><MoneyInput large autoFocus={!tx} label="Jumlah" value={value} onChange={setValue} />
      <Label>Keterangan</Label><input aria-label="Keterangan" value={title} onChange={(e) => changeTitle(e.target.value)} maxLength={80} className={textField} placeholder={income ? "Contoh: Penjualan roti harian" : "Contoh: Belanja tepung & telur"}/>
      <Label>Kategori</Label><Chips options={cats} value={category} onChange={(c) => { setCategory(c); setPicked(true); }} />
      <Label>Tanggal</Label><DateInput value={date} onChange={setDate} />
      <Button className="mt-6 h-12 w-full" disabled={!value} onClick={save}>{tx ? "Simpan perubahan" : "Simpan transaksi"}</Button>
      {tx && <Button variant="ghost" className="mt-2 h-11 w-full text-xs text-danger hover:text-danger" onClick={() => { removeTransaction(tx.id); onClose(); }}><Trash2 size={15} /> Hapus transaksi</Button>}
    </SheetFrame>
  );
}

function CsvSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const result: CsvResult | null = text.trim() ? parseCsv(text) : null;
  const run = () => {
    if (!result?.rows.length) return;
    const n = addTransactions(result.rows);
    logActivity({ tool: "import_csv", tier: "T2", status: "approved", summary: `${n} transaksi diimpor dari CSV${result.errors.length ? `, ${result.errors.length} baris dilewati` : ""}` });
    toast.success(`${n} transaksi berhasil diimpor.`);
    onClose();
  };
  return (
    <SheetFrame eyebrow="IMPOR CSV" title="Masukkan catatan lama" onClose={onClose}>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Pilih berkas CSV dari Excel atau tempel isinya. Kolom: tanggal, jenis, jumlah, kategori, keterangan.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"><Upload size={15} /> Pilih berkas<input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></label>
        <Button variant="secondary" className="h-11 text-xs" onClick={() => setText(csvTemplate)}>Lihat contoh</Button>
      </div>
      <textarea aria-label="Isi CSV" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-3 w-full rounded-2xl border border-border bg-transparent p-3 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring" placeholder={"tanggal;jenis;jumlah;kategori;keterangan\n09/10/2026;pemasukan;320.000;Penjualan;Roti manis pagi"} />
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="rounded-xl bg-success-soft px-3 py-2 font-semibold text-success">{result.rows.length} transaksi siap diimpor{result.rows.length ? `, total ${rp(result.rows.reduce((s, r) => s + r.amount, 0))}` : ""}.</p>
          {result.errors.length > 0 && (
            <div className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
              <p className="font-semibold">{result.errors.length} baris dilewati:</p>
              <ul className="mt-1 space-y-0.5">{result.errors.slice(0, 5).map((e) => <li key={e.line}>Baris {e.line}: {e.reason}</li>)}{result.errors.length > 5 && <li>… dan {result.errors.length - 5} baris lain.</li>}</ul>
            </div>
          )}
        </div>
      )}
      <Button className="mt-5 h-12 w-full" disabled={!result?.rows.length} onClick={run}>Impor {result?.rows.length ? `${result.rows.length} transaksi` : ""}</Button>
    </SheetFrame>
  );
}

function BottomNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  const homeItem = { view: "home" as View, label: "Beranda", icon: <Home /> };
  const reportsItem = { view: "reports" as View, label: "Laporan", icon: <FileChartColumn /> };
  const finixItem = { view: "finix" as View, label: "Finix", icon: <Bot /> };
  const profileItem = { view: "profile" as View, label: "Profil", icon: <CircleUserRound /> };
  return <nav className="absolute bottom-0 left-0 right-0 z-40 flex h-20 items-center justify-around border-t border-border bg-card/95 px-4 backdrop-blur"><NavButton item={homeItem} active={active} onNavigate={onNavigate}/><NavButton item={reportsItem} active={active} onNavigate={onNavigate}/><Button className="-mt-9 size-16 rounded-2xl p-0 shadow-xl shadow-primary/30" onClick={() => onNavigate("scan")} aria-label="Pindai struk"><Camera size={25}/></Button><NavButton item={finixItem} active={active} onNavigate={onNavigate}/><NavButton item={profileItem} active={active} onNavigate={onNavigate}/></nav>;
}

function NavButton({ item, active, onNavigate }: { item: {view: View; label: string; icon: ReactNode}; active: View; onNavigate: (view: View) => void }) { const selected = active === item.view; return <Button variant="ghost" className={`h-14 w-14 flex-col gap-1 rounded-xl p-0 text-[9px] ${selected ? "text-primary" : "text-muted-foreground"}`} onClick={() => onNavigate(item.view)}>{item.icon}<span>{item.label}</span></Button>; }
