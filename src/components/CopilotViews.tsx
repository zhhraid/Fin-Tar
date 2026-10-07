import { AlertTriangle, ArrowLeft, BadgeCheck, CheckCircle2, Flame, HeartPulse, Landmark, Lock, ShieldCheck, Store, TrendingUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cashAlerts, rp, totals } from "@/lib/financials";

function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 px-5 pb-2 pt-6">
      <Button variant="icon" size="icon" className="rounded-full" onClick={onBack} aria-label="Kembali"><ArrowLeft size={18} /></Button>
      <div><p className="text-xs font-bold text-primary">{eyebrow}</p><h1 className="text-xl font-extrabold">{title}</h1></div>
    </header>
  );
}

function Chips<T extends string | number>({ options, value, onChange, format }: { options: T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${o === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary"}`}>{format ? format(o) : String(o)}</button>
      ))}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;

/* ---------- Financing matching ---------- */
const lenders = [
  { name: "KUR Mikro", type: "Bank penyalur KUR", rate: 6, max: 50000000, purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: "5–7 hari", note: "Bunga disubsidi pemerintah" },
  { name: "Koperasi UMKM", type: "Koperasi simpan pinjam", rate: 12, max: 25000000, purposes: ["Tambah stok", "Renovasi toko"], days: "2–3 hari", note: "Tanpa agunan s.d. Rp10 jt" },
  { name: "Pembiayaan Pemasok", type: "Tempo bayar bahan baku", rate: 2, max: 10000000, purposes: ["Tambah stok"], days: "Instan", note: "Bayar 60 hari setelah barang diterima", flat: true },
  { name: "Pinjaman Digital Produktif", type: "Platform berizin OJK", rate: 24, max: 20000000, purposes: ["Tambah stok", "Beli alat", "Renovasi toko"], days: "1 hari", note: "Cair cepat, bunga lebih tinggi" },
];

export function LoanView({ onBack }: { onBack: () => void }) {
  const [amount, setAmount] = useState(5000000);
  const [purpose, setPurpose] = useState("Tambah stok");
  const [tenor, setTenor] = useState(24);
  const monthlyProfit = totals.net;

  const matches = lenders
    .map((l) => {
      const eligible = amount <= l.max && l.purposes.includes(purpose);
      const installment = l.flat ? (amount * (1 + l.rate / 100)) / 2 : (amount * (1 + (l.rate / 100) * (tenor / 12))) / tenor;
      const ratio = installment / monthlyProfit;
      const score = !eligible ? 0 : Math.max(20, Math.round(100 - ratio * 90 - l.rate));
      return { ...l, eligible, installment, ratio, score };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="PENCOCOKAN PEMBIAYAAN" title="Ajukan modal usaha" onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-2xl bg-muted p-4 text-xs leading-relaxed">
          <p className="font-bold text-foreground">Profil kelayakan Viera Bakery</p>
          <p className="mt-1 text-muted-foreground">Profit rata-rata {rp(monthlyProfit)}/bulan • 24 transaksi tercatat • usaha aktif. Cicilan sehat maksimal ~30% dari profit.</p>
        </div>
        <Label>Butuh modal berapa?</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={amount} onChange={setAmount} format={(v) => `Rp${v / 1e6} jt`} />
        <Label>Untuk apa?</Label>
        <Chips options={["Tambah stok", "Beli alat", "Renovasi toko"]} value={purpose} onChange={setPurpose} />
        <Label>Lama cicilan</Label>
        <Chips options={[6, 12, 24]} value={tenor} onChange={setTenor} format={(v) => `${v} bulan`} />

        <h2 className="mb-3 mt-7 font-bold">Opsi yang cocok untukmu</h2>
        <div className="space-y-3">
          {matches.map((m, i) => {
            const healthy = m.ratio <= 0.3;
            return (
              <div key={m.name} className={`rounded-2xl border p-4 ${m.eligible ? (i === 0 ? "border-primary" : "border-border") : "border-border opacity-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><Landmark size={18} /></div>
                    <div><p className="text-sm font-bold">{m.name}</p><p className="text-[10px] text-muted-foreground">{m.type}</p></div>
                  </div>
                  {m.eligible ? <span className="rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">{m.score}% cocok</span> : <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Lock size={11} /> Tidak memenuhi</span>}
                </div>
                {m.eligible && (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                      <div><p className="text-muted-foreground">Bunga</p><p className="text-xs font-bold">{m.rate}%{m.flat ? " flat" : "/thn"}</p></div>
                      <div><p className="text-muted-foreground">{m.flat ? "Bayar/tempo" : "Cicilan/bln"}</p><p className="text-xs font-bold">{rp(m.installment)}</p></div>
                      <div><p className="text-muted-foreground">Cair</p><p className="text-xs font-bold">{m.days}</p></div>
                    </div>
                    <p className={`mt-3 flex items-center gap-1.5 text-[11px] font-semibold ${healthy ? "text-success" : "text-danger"}`}>{healthy ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{healthy ? "Cicilan aman untuk arus kasmu" : `Cicilan ${Math.round(m.ratio * 100)}% dari profit — berisiko`}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{m.note}</p>
                    {i === 0 && <Button className="mt-3 h-10 w-full text-xs" onClick={() => toast.success(`Pengajuan ${m.name} ${rp(amount)} terkirim. Dokumen diisi otomatis dari laporanmu.`)}>Ajukan sekarang</Button>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

/* ---------- Insurance matching ---------- */
const risks = [
  { key: "fire", label: "Kebakaran & bencana", icon: <Flame size={16} /> },
  { key: "theft", label: "Pencurian", icon: <Lock size={16} /> },
  { key: "biz", label: "Gangguan usaha", icon: <Store size={16} /> },
  { key: "health", label: "Kesehatan karyawan", icon: <HeartPulse size={16} /> },
];
const plans = [
  { name: "Proteksi Toko Dasar", covers: ["fire"], rate: 0.0012, note: "Oven, mixer, dan bangunan toko" },
  { name: "Proteksi Toko Plus", covers: ["fire", "theft"], rate: 0.002, note: "Termasuk kehilangan stok & uang kas" },
  { name: "Usaha Aman Lengkap", covers: ["fire", "theft", "biz"], rate: 0.003, note: "Ganti rugi pendapatan saat toko tutup paksa" },
  { name: "Sehat Karyawan Mikro", covers: ["health"], rate: 0, fixed: 45000, note: "Rawat jalan & inap untuk 1–5 karyawan" },
];

export function InsuranceView({ onBack }: { onBack: () => void }) {
  const [picked, setPicked] = useState<string[]>(["fire", "theft"]);
  const [assetValue, setAssetValue] = useState(10000000);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const results = plans
    .map((p) => {
      const hit = p.covers.filter((c) => picked.includes(c)).length;
      const miss = picked.filter((c) => !p.covers.includes(c)).length;
      const premium = p.fixed ?? Math.max(15000, Math.round((assetValue * p.rate) / 1000) * 1000);
      const score = hit === 0 ? 0 : Math.round((hit / (hit + miss)) * 100 - Math.max(0, p.covers.length - hit) * 8);
      return { ...p, premium, score, share: premium / totals.net };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="REKOMENDASI ASURANSI" title="Lindungi tokomu" onBack={onBack} />
      <div className="px-5">
        <Label>Risiko yang ingin dilindungi</Label>
        <div className="grid grid-cols-2 gap-2">
          {risks.map((r) => {
            const on = picked.includes(r.key);
            return <button key={r.key} onClick={() => toggle(r.key)} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{r.icon}{r.label}</button>;
          })}
        </div>
        <Label>Nilai aset toko</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={assetValue} onChange={setAssetValue} format={(v) => `Rp${v / 1e6} jt`} />

        <h2 className="mb-3 mt-7 font-bold">Paket yang direkomendasikan</h2>
        {results.length === 0 && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Pilih minimal satu risiko untuk melihat rekomendasi.</p>}
        <div className="space-y-3">
          {results.map((p, i) => (
            <div key={p.name} className={`rounded-2xl border p-4 ${i === 0 ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><ShieldCheck size={18} /></div><div><p className="text-sm font-bold">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.note}</p></div></div>
                <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">{p.score}% cocok</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.covers.map((c) => <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold">{risks.find((r) => r.key === c)?.label}</span>)}</div>
              <div className="mt-3 flex items-end justify-between">
                <div><p className="text-[10px] text-muted-foreground">Premi per bulan</p><p className="text-base font-extrabold">{rp(p.premium)}</p><p className="text-[10px] text-success">{(p.share * 100).toFixed(1)}% dari profit bulanan</p></div>
                {i === 0 && <Button className="h-10 px-4 text-xs" onClick={() => toast.success(`${p.name} aktif! Polis dikirim ke email kamu.`)}>Beli sekarang</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ---------- Cashflow alerts ---------- */
const alertStyle = {
  danger: { box: "border-danger/30 bg-danger-soft", icon: <AlertTriangle size={16} className="text-danger" /> },
  warning: { box: "border-border bg-muted", icon: <AlertTriangle size={16} className="text-primary" /> },
  success: { box: "border-success/30 bg-success-soft", icon: <TrendingUp size={16} className="text-success" /> },
};

export function AlertCard({ alert }: { alert: (typeof cashAlerts)[number] }) {
  const s = alertStyle[alert.level];
  return <div className={`flex gap-3 rounded-2xl border p-4 ${s.box}`}><span className="mt-0.5 shrink-0">{s.icon}</span><div><p className="text-sm font-bold">{alert.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.text}</p></div></div>;
}

export function AlertsView({ onBack, onLoan }: { onBack: () => void; onLoan: () => void }) {
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="MANAJEMEN ARUS KAS" title="Peringatan kas" onBack={onBack} />
      <div className="space-y-3 px-5 pt-3">
        {cashAlerts.map((a) => <AlertCard key={a.title} alert={a} />)}
        <div className="rounded-2xl border border-primary p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><BadgeCheck size={16} className="text-primary" /> Saran Finix</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Untuk menutup kekurangan kas restok Ramadan, Pembiayaan Pemasok (tempo 60 hari) paling ringan untuk arus kasmu.</p>
          <Button className="mt-3 h-10 w-full text-xs" onClick={onLoan}>Lihat opsi pembiayaan</Button>
        </div>
      </div>
    </main>
  );
}
