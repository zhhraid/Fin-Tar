import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Camera,
  ChevronRight,
  CircleUserRound,
  FileChartColumn,
  Home,
  Landmark,
  PackageCheck,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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

type View = "home" | "reports" | "scan" | "finix" | "profile";
type EntryType = "income" | "expense" | null;

const transactions = [
  { id: "#099", title: "Restok Bahan Baku", date: "4 Jan • 14:20", amount: "-Rp245.000", type: "expense" },
  { id: "#098", title: "Penjualan Harian", date: "3 Jan • 20:05", amount: "+Rp890.000", type: "income" },
  { id: "#097", title: "Biaya Pengiriman", date: "2 Jan • 16:45", amount: "-Rp85.000", type: "expense" },
];

function Index() {
  const [view, setView] = useState<View>("home");
  const [entry, setEntry] = useState<EntryType>(null);
  const [saved, setSaved] = useState(false);

  const navigate = (next: View) => {
    setView(next);
    setSaved(false);
  };

  return (
    <div className="min-h-screen bg-background px-0 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-screen w-full max-w-md overflow-hidden bg-card shadow-2xl sm:min-h-[880px] sm:rounded-[2rem] sm:border sm:border-border">
        {view === "home" && <HomeView onNavigate={navigate} onEntry={setEntry} />}
        {view === "reports" && <ReportsView />}
        {view === "scan" && <ScanView saved={saved} onSave={() => setSaved(true)} onClose={() => navigate("home")} />}
        {view === "finix" && <FinixView />}
        {view === "profile" && <ProfileView />}
        {view !== "scan" && <BottomNav active={view} onNavigate={navigate} />}
        {entry && <EntrySheet type={entry} onClose={() => setEntry(null)} />}
      </div>
    </div>
  );
}

function HomeView({ onNavigate, onEntry }: { onNavigate: (view: View) => void; onEntry: (type: EntryType) => void }) {
  return (
    <main className="pb-28">
      <header className="flex items-center justify-between px-5 pb-4 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp size={19} /></div>
            <h1 className="text-xl font-extrabold text-primary">FinTar</h1>
          </div>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">Viera Bakery <span className="mx-1">•</span> <span className="text-success">Online</span></p>
        </div>
        <Button variant="icon" className="relative size-10 rounded-full p-0" aria-label="Notifikasi">
          <Bell size={18} />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-muted" />
        </Button>
      </header>

      <section className="px-5 pt-2">
        <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/20">
          <div className="mb-6 flex items-start justify-between">
            <div><p className="text-sm font-medium opacity-75">Saldo Saat Ini</p><h2 className="mt-1 text-3xl font-bold">Rp1.100.000</h2></div>
            <span className="rounded-md bg-primary-foreground/15 px-2 py-1 text-[10px] font-bold uppercase">Lite Plan</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="text-[10px] uppercase opacity-70">Pemasukan</p><p className="mt-1 text-sm font-bold">+Rp2.907k</p></div>
            <div className="rounded-xl bg-primary-foreground/10 p-3"><p className="text-[10px] uppercase opacity-70">Pengeluaran</p><p className="mt-1 text-sm font-bold">-Rp1.807k</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11 border-primary-foreground/20 bg-primary-foreground text-xs text-primary" onClick={() => onEntry("income")}><Plus size={15} /> Pemasukan</Button>
            <Button className="h-11 border border-primary-foreground/30 bg-primary text-xs shadow-none hover:bg-primary" onClick={() => onEntry("expense")}><span className="text-lg leading-none">−</span> Pengeluaran</Button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><div className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><Landmark size={19} /></div><div><p className="text-xs font-bold">Pinjaman</p><p className="text-[10px] text-muted-foreground">Cek limit usaha</p></div></div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><div className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><ShieldCheck size={19} /></div><div><p className="text-xs font-bold">Asuransi</p><p className="text-[10px] text-muted-foreground">Proteksi toko</p></div></div>
      </section>

      <section className="mt-6 px-5">
        <button onClick={() => onNavigate("finix")} className="relative w-full overflow-hidden rounded-3xl bg-brand-dark p-6 text-left text-brand-dark-foreground transition-transform active:scale-[0.99]">
          <div className="mb-4 flex items-center gap-2"><div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles size={15} /></div><p className="text-sm font-bold">Finix AI Analysis</p><ChevronRight className="ml-auto" size={18} /></div>
          <p className="text-sm leading-relaxed opacity-80">Bulan depan adalah Ramadan. Tambah stok <strong className="text-brand-dark-foreground">tepung terigu 20%</strong> berdasarkan tren penjualanmu.</p>
          <div className="mt-5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card/10"><div className="h-full w-3/4 bg-primary" /></div><span className="text-[10px] opacity-60">Target laba 75%</span></div>
        </button>
      </section>

      <section className="mt-7 px-5">
        <div className="mb-3 flex items-end justify-between"><h3 className="font-bold">Riwayat Cashflow</h3><Button variant="ghost" className="h-auto p-0 text-xs text-primary" onClick={() => onNavigate("reports")}>Lihat Semua</Button></div>
        <TransactionList items={transactions.slice(0, 2)} />
      </section>
    </main>
  );
}

function TransactionList({ items }: { items: typeof transactions }) {
  return <div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border p-4"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-[10px] font-bold text-muted-foreground">{item.id}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{item.title}</p><p className="text-[10px] text-muted-foreground">{item.date}</p></div></div><p className={`ml-2 shrink-0 text-sm font-bold ${item.type === "income" ? "text-success" : "text-danger"}`}>{item.amount}</p></div>)}</div>;
}

function ReportsView() {
  const pct = (n: number) => `${((n / totals.revenue) * 100).toFixed(1)}%`;
  const totalAssets = balanceSheet.assets.reduce((s, i) => s + i.value, 0);
  const totalLiab = balanceSheet.liabilities.reduce((s, i) => s + i.value, 0);
  const totalEquity = balanceSheet.equity.reduce((s, i) => s + i.value, 0);
  const netCash = cashFlow.reduce((s, i) => s + i.value, 0);
  return (
    <main className="min-h-screen px-5 pb-28 pt-7">
      <p className="text-xs font-bold text-primary">LAPORAN KEUANGAN</p>
      <h1 className="mt-1 text-2xl font-extrabold">Viera Bakery</h1>
      <p className="text-xs text-muted-foreground">Periode 1–31 Januari • dalam Rupiah</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Kpi label="Pendapatan" value={`${(totals.revenue / 1e6).toFixed(2)} jt`} />
        <Kpi label="Margin kotor" value={pct(totals.gross)} />
        <Kpi label="Margin bersih" value={pct(totals.net)} accent />
      </div>

      <Statement title="Laporan Laba Rugi" icon={<FileChartColumn size={16} />}>
        <Group label="Pendapatan">{incomeStatement.revenue.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label="Harga pokok penjualan">{incomeStatement.cogs.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label="Laba kotor" value={totals.gross} subtotal />
        <Group label="Beban operasional">{incomeStatement.opex.map((r) => <Line key={r.label} label={r.label} value={-r.value} />)}</Group>
        <Line label="Laba bersih" value={totals.net} total />
      </Statement>

      <Statement title="Laporan Arus Kas" icon={<WalletCards size={16} />}>
        {cashFlow.map((c) => <Line key={c.label} label={c.label} value={c.value} />)}
        <Line label="Kenaikan kas bersih" value={netCash} total />
      </Statement>

      <Statement title="Neraca Ringkas" icon={<Landmark size={16} />}>
        <Group label="Aset">{balanceSheet.assets.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label="Total aset" value={totalAssets} subtotal />
        <Group label="Kewajiban">{balanceSheet.liabilities.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Group label="Ekuitas">{balanceSheet.equity.map((r) => <Line key={r.label} label={r.label} value={r.value} />)}</Group>
        <Line label="Total kewajiban + ekuitas" value={totalLiab + totalEquity} total />
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-success"><ShieldCheck size={12} /> Neraca seimbang</p>
      </Statement>

      <h2 className="mb-3 mt-7 font-bold">Transaksi terakhir</h2>
      <TransactionList items={transactions} />
    </main>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl p-3 ${accent ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className={`text-[10px] font-semibold ${accent ? "opacity-75" : "text-muted-foreground"}`}>{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>;
}

function Statement({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="mt-5 rounded-3xl border border-border p-5"><h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary">{icon}</span>{title}</h2><div className="space-y-1">{children}</div></section>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pt-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>{children}</div>;
}

function Line({ label, value, subtotal = false, total = false }: { label: string; value: number; subtotal?: boolean; total?: boolean }) {
  const cls = total ? "mt-2 border-t-2 border-foreground pt-2 text-sm font-extrabold" : subtotal ? "mt-1 border-t border-border pt-2 text-sm font-bold" : "text-xs";
  const color = total ? (value >= 0 ? "text-success" : "text-danger") : value < 0 ? "text-danger" : "";
  return <div className={`flex justify-between gap-4 py-0.5 ${cls}`}><span className={total || subtotal ? "" : "text-muted-foreground"}>{label}</span><span className={`shrink-0 tabular-nums ${color}`}>{value < 0 ? `(${rp(-value)})` : rp(value)}</span></div>;
}

function ScanView({ saved, onSave, onClose }: { saved: boolean; onSave: () => void; onClose: () => void }) {
  if (saved) return <main className="grid min-h-screen place-items-center bg-background p-8 text-center"><div><div className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><PackageCheck size={38} /></div><h1 className="mt-5 text-2xl font-extrabold">Transaksi tersimpan</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Data struk sudah masuk ke laporan pengeluaran Januari.</p><Button className="mt-7 h-12 w-full" onClick={onClose}>Kembali ke beranda</Button></div></main>;
  return <main className="min-h-screen bg-brand-dark text-brand-dark-foreground"><header className="flex items-center justify-between p-5"><div><p className="text-xs font-bold text-primary">PEMINDAI STRUK</p><h1 className="mt-1 text-lg font-bold">Arahkan kamera ke nota</h1></div><Button variant="ghost" className="size-10 rounded-full p-0 text-brand-dark-foreground hover:bg-card/10 hover:text-brand-dark-foreground" onClick={onClose} aria-label="Tutup"><X /></Button></header><div className="px-5"><div className="relative h-80 overflow-hidden rounded-3xl border border-card/20 bg-card/5"><div className="absolute inset-8 rounded-lg border-2 border-primary"><span className="absolute left-3 top-3 text-xs font-semibold">ORDER #A099</span><div className="animate-scan-line absolute left-0 right-0 top-10 h-0.5 bg-primary shadow-lg shadow-primary" /><ReceiptText className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20" size={96} /></div></div><p className="mt-3 text-center text-xs opacity-60">Struk terdeteksi • pastikan tulisan terlihat jelas</p></div><section className="mt-6 rounded-t-[2rem] bg-card p-6 text-foreground"><div className="mb-5 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><ScanLine /></div><div><h2 className="font-bold">Data berhasil dibaca</h2><p className="text-xs text-muted-foreground">Periksa sebelum disimpan</p></div></div><div className="space-y-3 text-sm"><Row label="Tepung terigu 1 kg × 72" value="Rp2.360.000"/><Row label="Telur per kg × 56" value="Rp760.000"/><Row label="Cokelat × 32" value="Rp2.540.000"/><div className="border-t border-border pt-3"><Row label="Jumlah total" value="Rp6.393.600" bold /></div></div><Button className="mt-6 h-12 w-full" onClick={onSave}>Konfirmasi & simpan</Button></section></main>;
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) { return <div className={`flex justify-between gap-4 ${bold ? "font-bold" : ""}`}><span>{label}</span><span className="shrink-0">{value}</span></div>; }


function ProfileView() { return <main className="min-h-screen px-5 pb-28 pt-10 text-center"><div className="mx-auto grid size-24 place-items-center rounded-full bg-muted text-primary"><CircleUserRound size={48}/></div><h1 className="mt-4 text-2xl font-extrabold">Viera Bakery</h1><p className="mt-1 text-sm text-muted-foreground">Paket Lite • aktif</p><div className="mt-8 space-y-3 text-left"><Row label="Kategori usaha" value="Makanan"/><Row label="Pencatatan bulan ini" value="24 transaksi"/><Row label="Status sinkronisasi" value="Aktif"/></div></main>; }

function EntrySheet({ type, onClose }: { type: Exclude<EntryType, null>; onClose: () => void }) {
  const income = type === "income";
  return <div className="absolute inset-0 z-50 flex items-end bg-foreground/30 backdrop-blur-sm"><div className="w-full rounded-t-[2rem] bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className={`text-xs font-bold ${income ? "text-success" : "text-danger"}`}>{income ? "PEMASUKAN" : "PENGELUARAN"}</p><h2 className="mt-1 text-xl font-extrabold">Tambah transaksi</h2></div><Button variant="icon" className="size-10 rounded-full p-0" onClick={onClose}><X size={18}/></Button></div><label className="mt-6 block text-xs font-bold text-muted-foreground">JUMLAH</label><div className="mt-2 flex items-center rounded-2xl border border-border px-4"><span className="font-bold">Rp</span><input autoFocus inputMode="numeric" className="h-14 min-w-0 flex-1 px-3 text-xl font-bold outline-none" placeholder="0" /></div><label className="mt-4 block text-xs font-bold text-muted-foreground">KETERANGAN</label><input className="mt-2 h-12 w-full rounded-2xl border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={income ? "Contoh: Penjualan harian" : "Contoh: Belanja bahan baku"}/><Button className="mt-6 h-12 w-full" onClick={onClose}>Simpan transaksi</Button></div></div>;
}

function BottomNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  const homeItem = { view: "home" as View, label: "Beranda", icon: <Home /> };
  const reportsItem = { view: "reports" as View, label: "Laporan", icon: <FileChartColumn /> };
  const finixItem = { view: "finix" as View, label: "Finix", icon: <Bot /> };
  const profileItem = { view: "profile" as View, label: "Profil", icon: <CircleUserRound /> };
  return <nav className="absolute bottom-0 left-0 right-0 z-40 flex h-20 items-center justify-around border-t border-border bg-card/95 px-4 backdrop-blur"><NavButton item={homeItem} active={active} onNavigate={onNavigate}/><NavButton item={reportsItem} active={active} onNavigate={onNavigate}/><Button className="-mt-9 size-16 rounded-2xl p-0 shadow-xl shadow-primary/30" onClick={() => onNavigate("scan")} aria-label="Pindai struk"><Camera size={25}/></Button><NavButton item={finixItem} active={active} onNavigate={onNavigate}/><NavButton item={profileItem} active={active} onNavigate={onNavigate}/></nav>;
}

function NavButton({ item, active, onNavigate }: { item: {view: View; label: string; icon: ReactNode}; active: View; onNavigate: (view: View) => void }) { const selected = active === item.view; return <Button variant="ghost" className={`h-14 w-14 flex-col gap-1 rounded-xl p-0 text-[9px] ${selected ? "text-primary" : "text-muted-foreground"}`} onClick={() => onNavigate(item.view)}>{item.icon}<span>{item.label}</span></Button>; }
