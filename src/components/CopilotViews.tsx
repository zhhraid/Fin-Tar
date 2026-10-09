import { AlertTriangle, ArrowLeft, BadgeCheck, CalendarClock, CheckCircle2, Download, FileText, Flame, HeartPulse, Info, Landmark, Loader2, Lock, Plus, ShieldCheck, Store, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chips, DateInput, Label, MoneyInput } from "@/components/fields";
import { exportProposalPdf } from "@/lib/export";
import { addPlanned, cancelInsurance, chooseInsurance, clearLoan, currentInsurance, dateInputValue, daysUntil, forecastCash, getCreditProfile, getInsights, loanStage, loanStages, logActivity, openPlanned, payableTotal, removePlanned, rp, settlePlanned, shortDate, submitLoan, useActivity, useLedger, useLoanApplication, usePlanned, useProfile, type Insight, type InsuranceChoice, type LoanApplication, type Planned } from "@/lib/financials";
import { healthyCap, rankLenders, type LenderMatch } from "@/lib/scoring";

function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 px-5 pb-2 pt-6">
      <Button variant="icon" size="icon" className="rounded-full" onClick={onBack} aria-label="Kembali"><ArrowLeft size={18} /></Button>
      <div><p className="text-xs font-bold text-primary">{eyebrow}</p><h1 className="text-xl font-extrabold">{title}</h1></div>
    </header>
  );
}

const SimNote = ({ children }: { children: ReactNode }) => <p className="mt-3 flex gap-2 rounded-xl bg-muted px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0 text-primary" /><span>{children}</span></p>;

/* ---------- Financing matching ---------- */
type Draft = Omit<LoanApplication, "id" | "submittedAt">;

export function LoanView({ onBack }: { onBack: () => void }) {
  const [amount, setAmount] = useState(5000000);
  const [purpose, setPurpose] = useState("Tambah stok");
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

  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="AJUKAN MODAL" title="Cari pembiayaan yang cocok" onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-2xl bg-muted p-4 text-xs leading-relaxed">
          <p className="font-bold text-foreground">Profil kelayakan {profile.name}</p>
          <p className="mt-1 text-muted-foreground">Laba rata-rata {rp(credit.monthlyProfit)}/bulan • {credit.txCount} transaksi tercatat selama {credit.recordedDays} hari. Cicilan sehat maksimal 30% dari laba: <strong className="text-foreground">{rp(healthyCap(credit.monthlyProfit))}/bulan</strong>.</p>
        </div>
        <Label>Butuh modal berapa?</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={amount} onChange={setAmount} format={(v) => `Rp${v / 1e6} jt`} />
        <Label>Untuk apa?</Label>
        <Chips options={["Tambah stok", "Beli alat", "Renovasi toko"]} value={purpose} onChange={setPurpose} />
        <Label>Lama cicilan</Label>
        <Chips options={[6, 12, 24]} value={tenor} onChange={setTenor} format={(v) => `${v} bulan`} />

        <h2 className="mb-1 mt-7 font-bold">Opsi yang cocok untukmu</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">Lembaga dan bunga di bawah adalah contoh untuk simulasi.</p>
        <div className="space-y-3">
          {matches.map((m, i) => (
            <div key={m.lender.name} className={`rounded-2xl border p-4 ${m.eligible ? (i === 0 ? "border-primary" : "border-border") : "border-border opacity-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><Landmark size={18} /></div>
                  <div><p className="text-sm font-bold">{m.lender.name}</p><p className="text-[10px] text-muted-foreground">{m.lender.type}</p></div>
                </div>
                {m.eligible ? <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${m.risk ? "bg-danger-soft text-danger" : "bg-primary text-primary-foreground"}`}>Skor {m.score}/100</span> : <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Lock size={11} /> Tidak memenuhi</span>}
              </div>
              {!m.eligible && <p className="mt-2 text-[11px] text-muted-foreground">{m.blocker}</p>}
              {m.eligible && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                    <div><p className="text-muted-foreground">Bunga</p><p className="text-xs font-bold">{Math.round(m.lender.rate * 100)}%/thn</p></div>
                    <div><p className="text-muted-foreground">Cicilan × {m.tenor} bln</p><p className="text-xs font-bold">{rp(m.installment)}</p></div>
                    <div><p className="text-muted-foreground">Cair</p><p className="text-xs font-bold">{m.lender.daysLabel}</p></div>
                  </div>
                  {m.risk && <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-semibold text-danger"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Cicilan melewati batas aman {rp(m.cap)}/bulan. Kurangi jumlah atau perpanjang tenor.</p>}
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Alasan skor</p>
                  <ul className="mt-1 space-y-1">
                    {m.factors.map((f) => (
                      <li key={f.label} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span className={`mt-0.5 w-9 shrink-0 text-right font-bold tabular-nums ${f.points >= f.max * 0.7 ? "text-success" : "text-danger"}`}>{f.points}/{f.max}</span>
                        <span className="text-muted-foreground"><span className="font-semibold text-foreground">{f.label}.</span> {f.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant={i === 0 && !m.risk ? "default" : "secondary"} className="mt-3 h-10 w-full text-xs" onClick={() => draftFor(m)}>Buat proposal</Button>
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
  const pdf = async () => {
    setExporting(true);
    try {
      await exportProposalPdf(draft, ledger, profile, planned);
    } catch {
      toast.error("Gagal membuat PDF. Coba lagi.");
    }
    setExporting(false);
  };
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow={`PROPOSAL • ${draft.lender.toUpperCase()}`} title="Periksa proposalmu" onBack={onBack} />
      <div className="px-5">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Proposal ini terisi otomatis dari catatan transaksimu, jadi kamu tidak perlu menyusun laporan sendiri.</p>

        <section className="mt-4 rounded-3xl border border-border p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><Store size={15} /></span>Profil usaha</h2>
          <Fact label="Nama usaha" value={profile.name} />
          <Fact label="Kategori" value={profile.category} />
          <Fact label="Lama pencatatan" value={`${credit.recordedDays} hari • ${credit.txCount} transaksi`} />
        </section>

        <section className="mt-3 rounded-3xl border border-border p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><FileText size={15} /></span>Ringkasan keuangan</h2>
          <Fact label="Omzet rata-rata" value={`${rp(credit.monthlyRevenue)}/bulan`} />
          <Fact label="Laba bersih rata-rata" value={`${rp(credit.monthlyProfit)}/bulan`} />
          <Fact label="Margin bersih" value={`${(credit.margin * 100).toFixed(1)}%`} />
          <Fact label="Utang pemasok berjalan" value={rp(payableTotal(planned))} />
          <p className="mt-2 text-[10px] text-muted-foreground">Lampiran: laporan laba rugi, arus kas, dan neraca 3 bulan terakhir.</p>
        </section>

        <section className="mt-3 rounded-3xl border border-primary p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><Landmark size={15} /></span>Pinjaman yang diajukan</h2>
          <Fact label="Jumlah" value={rp(draft.amount)} />
          <Fact label="Tujuan" value={draft.purpose} />
          <Fact label="Lama cicilan" value={`${draft.tenor} bulan`} />
          <Fact label="Cicilan per bulan" value={rp(draft.installment)} />
          <Fact label="Porsi dari laba" value={credit.monthlyProfit > 0 ? `${Math.round((draft.installment / credit.monthlyProfit) * 100)}%` : "-"} />
        </section>

        <Button variant="secondary" className="mt-4 h-11 w-full text-xs" disabled={exporting} onClick={pdf}>{exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Unduh proposal (PDF)</Button>

        <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
          <span>Saya setuju ringkasan dan laporan keuangan di atas dibagikan ke {draft.lender} untuk menilai pengajuan ini.</span>
        </label>
        <Button className="mt-4 h-12 w-full" disabled={!agree} onClick={() => submitLoan(draft)}>Kirim proposal</Button>
        <SimNote>Simulasi: FinTar belum terhubung ke lembaga keuangan, jadi tidak ada data yang benar-benar dikirim. Keputusan pembiayaan ada di lembaga berizin.</SimNote>
      </div>
    </main>
  );
}

function LoanStatus({ application, onBack }: { application: LoanApplication; onBack: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const stage = loanStage(application, now);
  const done = stage === loanStages.length - 1;
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [done]);
  const hints = ["Lembaga menerima proposal dan lampiran laporanmu.", "Catatan transaksi dicek kelengkapan dan kewajarannya.", "Lembaga akan menghubungimu untuk tanda tangan dan pencairan."];
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="STATUS PENGAJUAN" title={application.lender} onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="text-xs opacity-75">{application.purpose}</p>
          <p className="mt-1 text-2xl font-bold">{rp(application.amount)}</p>
          <p className="mt-1 text-[11px] opacity-75">{rp(application.installment)} × {application.tenor} bulan</p>
        </div>

        <ol className="mt-6 space-y-5">
          {loanStages.map((s, i) => {
            const state = i < stage || (done && i === stage) ? "done" : i === stage ? "active" : "todo";
            return (
              <li key={s} className={`flex gap-3 ${state === "todo" ? "opacity-40" : ""}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-success-soft text-success" : "bg-muted text-primary"}`}>{state === "done" ? <CheckCircle2 size={16} /> : state === "active" ? <Loader2 size={16} className="animate-spin" /> : <span className="text-xs font-bold">{i + 1}</span>}</span>
                <div><p className="text-sm font-bold">{s}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hints[i]}</p></div>
              </li>
            );
          })}
        </ol>

        <SimNote>Simulasi: status ini berjalan otomatis untuk menunjukkan alurnya. Belum ada pengajuan sungguhan dan tidak ada dana yang cair.</SimNote>
        <Button variant="secondary" className="mt-4 h-11 w-full text-xs" onClick={clearLoan}>{done ? "Buat pengajuan baru" : "Batalkan pengajuan"}</Button>
      </div>
    </main>
  );
}

/* ---------- Insurance matching (simulated: no policy is issued) ---------- */
const risks = [
  { key: "fire", label: "Kebakaran & bencana", icon: <Flame size={16} /> },
  { key: "theft", label: "Pencurian", icon: <Lock size={16} /> },
  { key: "biz", label: "Gangguan usaha", icon: <Store size={16} /> },
  { key: "health", label: "Kesehatan karyawan", icon: <HeartPulse size={16} /> },
];
const riskLabel = (key: string) => risks.find((r) => r.key === key)?.label ?? key;
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
  const profit = getCreditProfile(useLedger()).monthlyProfit;
  const chosen = currentInsurance(useActivity());
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

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
    <main className="min-h-screen pb-28">
      <Header eyebrow="ASURANSI TOKO" title="Lindungi usahamu" onBack={onBack} />
      <div className="px-5">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Satu musibah bisa menghabiskan modal yang dikumpulkan bertahun-tahun. Dengan premi kecil tiap bulan, kerugian besar ditanggung perusahaan asuransi.</p>
        <ol className="mt-3 space-y-1.5 rounded-2xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
          <li><strong className="text-foreground">1.</strong> Pilih risiko yang kamu khawatirkan dan nilai aset tokomu.</li>
          <li><strong className="text-foreground">2.</strong> FinTar mencocokkan paket dan membandingkan preminya dengan labamu.</li>
          <li><strong className="text-foreground">3.</strong> Pilih paket, lalu FinTar meneruskan data usahamu ke penyedia (simulasi).</li>
        </ol>
        <Label>Risiko yang ingin dilindungi</Label>
        <div className="grid grid-cols-2 gap-2">
          {risks.map((r) => {
            const on = picked.includes(r.key);
            return <button key={r.key} onClick={() => toggle(r.key)} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{r.icon}{r.label}</button>;
          })}
        </div>
        <Label>Nilai aset toko</Label>
        <Chips options={[5000000, 10000000, 25000000, 50000000]} value={assetValue} onChange={setAssetValue} format={(v) => `Rp${v / 1e6} jt`} />

        <h2 className="mb-1 mt-7 font-bold">Paket yang direkomendasikan</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">Paket dan premi di bawah adalah contoh untuk simulasi.</p>
        {results.length === 0 && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Pilih minimal satu risiko untuk melihat rekomendasi.</p>}
        <div className="space-y-3">
          {results.map((p, i) => (
            <div key={p.name} className={`rounded-2xl border p-4 ${i === 0 ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary"><ShieldCheck size={18} /></div><div><p className="text-sm font-bold">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.note}</p></div></div>
                <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">{p.score}% cocok</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.covers.map((c) => <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold">{riskLabel(c)}</span>)}</div>
              <p className="mt-2 text-[11px] text-muted-foreground">Menutup {p.hit} dari {picked.length} risiko yang kamu pilih.</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><p className="text-[10px] text-muted-foreground">Premi per bulan</p><p className="text-base font-extrabold">{rp(p.premium)}</p>{profit > 0 && <p className="text-[10px] text-success">{((p.premium / profit) * 100).toFixed(1)}% dari laba bulanan</p>}</div>
                <Button variant={i === 0 ? "default" : "secondary"} className="h-10 shrink-0 px-4 text-xs" onClick={() => setDraft({ name: p.name, premium: p.premium, covers: p.covers, assetValue, uncovered: picked.filter((c) => !p.covers.includes(c)) })}>Pilih paket</Button>
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
  const { uncovered, ...choice } = draft;
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="KONFIRMASI PAKET" title={draft.name} onBack={onBack} />
      <div className="px-5">
        <section className="mt-3 rounded-3xl border border-primary p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><ShieldCheck size={15} /></span>Ringkasan perlindungan</h2>
          <Fact label="Usaha" value={profile.name} />
          <Fact label="Nilai aset yang dilindungi" value={rp(draft.assetValue)} />
          <Fact label="Premi per bulan" value={rp(draft.premium)} />
          <Fact label="Porsi dari laba bulanan" value={profit > 0 ? `${((draft.premium / profit) * 100).toFixed(1)}%` : "-"} />
        </section>

        <section className="mt-3 rounded-3xl border border-border p-5">
          <h2 className="mb-2 text-sm font-extrabold">Yang ditanggung</h2>
          <ul className="space-y-1.5">{draft.covers.map((c) => <li key={c} className="flex items-center gap-2 text-xs"><CheckCircle2 size={14} className="shrink-0 text-success" /> {riskLabel(c)}</li>)}</ul>
          {uncovered.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-extrabold">Belum ditanggung paket ini</h2>
              <ul className="space-y-1.5">{uncovered.map((c) => <li key={c} className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle size={14} className="shrink-0 text-danger" /> {riskLabel(c)}</li>)}</ul>
            </>
          )}
        </section>

        <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
          <span>Saya setuju profil usaha dan nilai aset di atas diteruskan ke penyedia asuransi untuk menyiapkan penawaran.</span>
        </label>
        <Button className="mt-4 h-12 w-full" disabled={!agree} onClick={() => chooseInsurance(choice)}>Ajukan paket ini</Button>
        <SimNote>Simulasi: FinTar belum terhubung ke perusahaan asuransi. Tidak ada polis yang terbit dan tidak ada premi yang ditagih.</SimNote>
      </div>
    </main>
  );
}

function InsuranceStatus({ choice, profit, onBack }: { choice: InsuranceChoice; profit: number; onBack: () => void }) {
  const planned = usePlanned();
  const premiumLabel = `Premi ${choice.name}`;
  const scheduled = openPlanned(planned).some((p) => p.label === premiumLabel);
  const steps = [
    { title: "Pengajuan diterima", text: "Data usaha dan pilihan paketmu diteruskan ke penyedia.", done: true },
    { title: "Penyedia menghubungimu", text: "Mereka memastikan nilai aset dan menjelaskan syarat polis.", done: false },
    { title: "Polis terbit setelah premi pertama", text: "Perlindungan mulai berlaku sejak polis diterbitkan.", done: false },
  ];
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="ASURANSI TOKO" title="Paket yang kamu ajukan" onBack={onBack} />
      <div className="px-5">
        <div className="mt-3 rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="text-xs opacity-75">Diajukan {new Date(choice.at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="mt-1 text-xl font-bold">{choice.name}</p>
          <p className="mt-1 text-[11px] opacity-75">{rp(choice.premium)}/bulan{profit > 0 ? ` • ${((choice.premium / profit) * 100).toFixed(1)}% dari laba` : ""} • aset {rp(choice.assetValue)}</p>
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

        <SimNote>Simulasi: langkah 2 dan 3 menggambarkan proses di produk sungguhan. Saat ini belum ada penyedia yang terhubung, jadi usahamu belum terlindungi.</SimNote>

        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold">Masukkan premi ke proyeksi kas</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{scheduled ? "Premi bulan depan sudah ada di daftar kewajiban, jadi proyeksi kas 30 hari sudah memperhitungkannya." : "Supaya proyeksi kas 30 hari ikut memperhitungkan premi bulan depan."}</p>
          {!scheduled && <Button variant="secondary" className="mt-3 h-10 w-full text-xs" onClick={() => addPlanned({ kind: "expense", label: premiumLabel, amount: choice.premium, due: dateInputValue(new Date(Date.now() + 30 * 86400000)) })}><CalendarClock size={14} /> Jadwalkan premi {rp(choice.premium)}</Button>}
        </div>
        <Button variant="secondary" className="mt-3 h-11 w-full text-xs" onClick={cancelInsurance}>Batalkan dan pilih paket lain</Button>
      </div>
    </main>
  );
}

/* ---------- Cashflow alerts, forecast and upcoming obligations ---------- */
const alertStyle = {
  danger: { box: "border-danger/30 bg-danger-soft", icon: <AlertTriangle size={16} className="text-danger" /> },
  warning: { box: "border-border bg-muted", icon: <AlertTriangle size={16} className="text-primary" /> },
  success: { box: "border-success/30 bg-success-soft", icon: <TrendingUp size={16} className="text-success" /> },
};

export function AlertCard({ alert, children }: { alert: Insight; children?: ReactNode }) {
  const s = alertStyle[alert.level];
  return <div className={`flex gap-3 rounded-2xl border p-4 ${s.box}`}><span className="mt-0.5 shrink-0">{s.icon}</span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{alert.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.text}</p>{children}</div></div>;
}

function PlannedForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<Planned["kind"]>("debt");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(dateInputValue);
  const save = () => {
    if (!amount || !due) return;
    addPlanned({ kind, label: label.trim().slice(0, 80) || (kind === "debt" ? "Utang pemasok" : "Belanja terjadwal"), amount, due });
    onDone();
  };
  return (
    <div className="rounded-2xl border border-primary p-4">
      <div className="grid grid-cols-2 gap-2">
        {(["debt", "expense"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-xl border py-2.5 text-xs font-bold ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{k === "debt" ? "Utang pemasok" : "Belanja terjadwal"}</button>)}
      </div>
      <Label>Keterangan</Label>
      <input aria-label="Keterangan kewajiban" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={kind === "debt" ? "Contoh: Utang tepung ke Toko Sejahtera" : "Contoh: Restok bahan Lebaran"} />
      <Label>Jumlah</Label>
      <MoneyInput label="Jumlah kewajiban" value={amount} onChange={setAmount} />
      <Label>Jatuh tempo</Label>
      <DateInput value={due} onChange={setDue} allowFuture />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-11 text-xs" onClick={onDone}>Batal</Button>
        <Button className="h-11 text-xs" disabled={!amount || !due} onClick={save}>Simpan</Button>
      </div>
    </div>
  );
}

export function AlertsView({ onBack, onLoan, onAsk, onEntry }: { onBack: () => void; onLoan: () => void; onAsk: (prompt: string) => void; onEntry: () => void }) {
  const ledger = useLedger();
  const profile = useProfile();
  const planned = usePlanned();
  const [adding, setAdding] = useState(false);
  const insights = getInsights(ledger, profile, planned);
  const forecast = forecastCash(ledger, profile, planned);
  const open = openPlanned(planned);
  const actions = {
    loan: { label: "Lihat opsi modal", run: onLoan },
    entry: { label: "Catat sekarang", run: onEntry },
  };
  return (
    <main className="min-h-screen pb-28">
      <Header eyebrow="DARI CATATANMU" title="Peringatan & proyeksi kas" onBack={onBack} />
      <div className="space-y-3 px-5 pt-3">
        {insights.map((a) => (
          <AlertCard key={a.title} alert={a}>
            {a.action && (
              <button className="mt-2 text-xs font-bold text-primary" onClick={a.action === "finix" ? () => onAsk(`${a.title}. Kenapa bisa begitu dan apa yang sebaiknya kulakukan?`) : actions[a.action].run}>{a.action === "finix" ? "Tanya Finix" : actions[a.action].label} →</button>
            )}
          </AlertCard>
        ))}

        <section className="rounded-3xl border border-border p-5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold"><span className="grid size-7 place-items-center rounded-lg bg-muted text-primary"><TrendingUp size={15} /></span>Proyeksi kas 30 hari</h2>
          <div className="mt-3 space-y-1 text-xs">
            <Fact label="Saldo kas sekarang" value={rp(forecast.cash)} />
            <Fact label="Rata-rata masuk per hari" value={`+${rp(forecast.dailyIn)}`} />
            <Fact label="Rata-rata keluar per hari" value={`-${rp(forecast.dailyOut)}`} />
            <Fact label="Kewajiban jatuh tempo ≤ 30 hari" value={`-${rp(forecast.dueTotal)}`} />
          </div>
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed ${forecast.deficit ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{forecast.deficit ? `Kas diperkirakan minus pada hari ke-${forecast.deficit.day}, kurang ${rp(forecast.deficit.shortfall)}.` : `Kas tidak minus. Saldo terendah ${rp(forecast.lowest.balance)}${forecast.lowest.day ? ` pada hari ke-${forecast.lowest.day}` : ""}.`}</p>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Asumsi: pemasukan dan pengeluaran harian sama dengan rata-rata 30 hari terakhir, dan semua kewajiban dibayar tepat waktu.</p>
        </section>

        <section>
          <div className="mb-3 mt-4 flex items-end justify-between"><h2 className="flex items-center gap-2 font-bold"><CalendarClock size={16} className="text-primary" /> Kewajiban mendatang</h2>{!adding && <Button variant="ghost" className="h-auto p-0 text-xs text-primary" onClick={() => setAdding(true)}><Plus size={14} /> Tambah</Button>}</div>
          {adding && <PlannedForm onDone={() => setAdding(false)} />}
          {!open.length && !adding && <p className="rounded-2xl bg-muted p-4 text-center text-xs text-muted-foreground">Belum ada utang atau belanja terjadwal. Tambahkan supaya proyeksi kas lebih akurat.</p>}
          <div className="mt-2 space-y-2">
            {open.map((o) => {
              const d = daysUntil(o.due);
              return (
                <div key={o.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{o.label}</p><p className={`text-[10px] ${d <= 7 ? "font-semibold text-danger" : "text-muted-foreground"}`}>{o.kind === "debt" ? "Utang" : "Belanja"} • {shortDate(o.due)} • {d < 0 ? `terlambat ${-d} hari` : d === 0 ? "hari ini" : `${d} hari lagi`}</p></div>
                    <p className="shrink-0 text-sm font-bold">{rp(o.amount)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" className="h-9 flex-1 text-xs" onClick={() => { settlePlanned(o.id); toast.success(`${o.label} ditandai lunas dan dicatat sebagai pengeluaran.`); }}><CheckCircle2 size={14} /> Sudah dibayar</Button>
                    <Button variant="secondary" size="icon-sm" className="size-9" aria-label={`Hapus ${o.label}`} onClick={() => removePlanned(o.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="flex items-center gap-2 px-1 pt-1 text-[11px] text-muted-foreground"><BadgeCheck size={14} className="shrink-0 text-primary" /> Dihitung otomatis dari transaksi 60 hari terakhir dan kewajiban di atas.</p>
      </div>
    </main>
  );
}
