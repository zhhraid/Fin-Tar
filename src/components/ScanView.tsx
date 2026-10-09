import { AlertTriangle, Camera, ImageUp, Info, Loader2, PackageCheck, PencilLine, Plus, ReceiptText, ScanLine, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsentGate } from "@/components/ConsentGate";
import { Chips, DateInput, Label, MoneyInput } from "@/components/fields";
import { authHeaders } from "@/lib/cloud";
import { addTransaction, dateInputToIso, dateInputValue, expenseCategories, incomeCategories, logActivity, rp, type Category, type Tx } from "@/lib/financials";

type Item = { name: string; qty: number; price: number; unsure?: boolean };
type ScanResult = { merchant: string; date: string; items: Item[]; total: number; category: Category; demo?: boolean };
type Draft = { merchant: string; date: string; items: Item[]; total: number; category: Category; type: Tx["type"]; demo: boolean };

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ScanView({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setDraft(null);
    setLoading(true);
    try {
      const dataUrl = await toDataUrl(file);
      setPhoto(dataUrl);
      const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ image: dataUrl }) });
      const data = (await res.json()) as ScanResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal membaca struk.");
      if (!data.items.length) throw new Error("Tidak ada struk terdeteksi. Foto ulang dengan lebih jelas, atau isi manual.");
      const today = dateInputValue();
      setDraft({ merchant: data.merchant, date: data.date && data.date <= today ? data.date : today, items: data.items, total: data.total, category: data.category, type: "expense", demo: Boolean(data.demo) });
      logActivity({ tool: "parse_receipt", tier: "T0", status: "completed", summary: `Struk ${data.merchant || "tanpa nama"} dibaca: ${data.items.length} barang, total ${rp(data.total)}${data.demo ? " (mode demo)" : ""}`, detail: { merchant: data.merchant, date: data.date, items: data.items, total: data.total } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membaca struk.");
    } finally {
      setLoading(false);
    }
  };

  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const editItem = (idx: number, patch: Partial<Item>) => setDraft((d) => (d ? { ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch, unsure: false } : it)) } : d));

  if (saved && draft)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-8 text-center">
        <div>
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><PackageCheck size={38} /></div>
          <h1 className="mt-5 text-2xl font-extrabold">Transaksi tersimpan</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{draft.type === "income" ? "Pemasukan" : "Pengeluaran"} {rp(draft.total)}{draft.merchant ? ` dari ${draft.merchant}` : ""} sudah masuk ke laporan.</p>
          <Button className="mt-7 h-12 w-full" onClick={onClose}>Kembali ke beranda</Button>
          <Button variant="secondary" className="mt-2 h-12 w-full" onClick={() => { setSaved(false); setDraft(null); setPhoto(null); }}>Pindai struk lain</Button>
        </div>
      </main>
    );

  const itemSum = draft ? draft.items.reduce((s, i) => s + i.price, 0) : 0;
  const unsure = draft ? draft.items.filter((i) => i.unsure).length : 0;
  const cats = draft?.type === "income" ? incomeCategories : expenseCategories;
  const save = () => {
    if (!draft || !draft.total) return;
    const title = (draft.merchant.trim() ? `Struk ${draft.merchant.trim()}` : "Transaksi dari struk").slice(0, 80);
    const tx = addTransaction({ title, amount: draft.total, type: draft.type, category: draft.category, source: "scan", date: dateInputToIso(draft.date) });
    logActivity({ tool: "save_transaction", tier: "T2", status: "approved", summary: `${title} ${rp(draft.total)} disimpan setelah dikonfirmasi`, detail: { transactionId: tx.id, amount: draft.total, category: draft.category } });
    setSaved(true);
  };
  const manual = <Button variant="ghost" className="mt-2 h-11 w-full text-xs" onClick={onManual} disabled={loading}><PencilLine size={15} /> Isi manual saja</Button>;

  return (
    <main className="min-h-screen bg-brand-dark text-brand-dark-foreground">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <header className="flex items-center justify-between p-5">
        <div><p className="text-xs font-bold text-primary">PINDAI STRUK</p><h1 className="mt-1 text-lg font-bold">{draft ? "Periksa hasil bacaan" : "Foto nota belanjamu"}</h1></div>
        <Button variant="ghost" className="size-10 rounded-full p-0 text-brand-dark-foreground hover:bg-card/10 hover:text-brand-dark-foreground" onClick={onClose} aria-label="Tutup"><X /></Button>
      </header>

      <ConsentGate feature="membaca struk" footer={manual}>
        <div className="px-5">
          <div className={`relative grid place-items-center overflow-hidden rounded-3xl border border-card/20 bg-card/5 ${draft ? "h-40" : "h-80"}`}>
            {photo ? <img src={photo} alt="Foto struk" className="h-full w-full object-contain" /> : <ReceiptText className="opacity-20" size={96} />}
            {loading && (
              <>
                <div className="animate-scan-line absolute left-6 right-6 top-10 h-0.5 bg-primary shadow-lg shadow-primary" />
                <div className="absolute bottom-4 flex items-center gap-2 rounded-full bg-brand-dark/80 px-3 py-1.5 text-xs font-semibold"><Loader2 size={14} className="animate-spin" /> Membaca teks struk...</div>
              </>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button className="h-12" onClick={() => cameraRef.current?.click()} disabled={loading}><Camera size={18} /> {photo ? "Foto ulang" : "Ambil foto"}</Button>
            <Button variant="secondary" className="h-12" onClick={() => galleryRef.current?.click()} disabled={loading}><ImageUp size={18} /> Dari galeri</Button>
          </div>
          {error && <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">{error}</p>}
          {!draft && (
            <>
              {!photo && !error && <p className="mt-3 text-center text-xs opacity-60">Pastikan seluruh struk terlihat dan tulisannya jelas</p>}
              <div className="[&_button]:text-brand-dark-foreground [&_button:hover]:bg-card/10 [&_button:hover]:text-brand-dark-foreground">{manual}</div>
            </>
          )}
        </div>
      </ConsentGate>

      {draft && (
        <section className="mt-6 rounded-t-[2rem] bg-card p-6 pb-10 text-foreground">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><ScanLine /></div>
            <div><h2 className="font-bold">Cocokkan dengan strukmu</h2><p className="text-xs text-muted-foreground">Hasil bacaan bisa keliru. Ubah yang salah sebelum disimpan.</p></div>
          </div>
          {draft.demo && <p className="mt-4 flex gap-2 rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0 text-primary" /> Mode demo: AI pembaca struk belum aktif, jadi ini contoh hasil bacaan, bukan isi fotomu.</p>}
          {unsure > 0 && <p className="mt-4 flex gap-2 rounded-xl bg-danger-soft px-4 py-3 text-xs font-semibold leading-relaxed text-danger"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {unsure} baris kurang jelas terbaca. Periksa baris yang ditandai.</p>}

          <Label>Jenis transaksi</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button key={t} type="button" onClick={() => edit({ type: t, category: (t === "income" ? incomeCategories : expenseCategories)[0]! })} className={`rounded-xl border py-2.5 text-xs font-bold ${draft.type === t ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{t === "income" ? "Pemasukan" : "Pengeluaran"}</button>
            ))}
          </div>

          <Label>Nama toko</Label>
          <input aria-label="Nama toko" value={draft.merchant} maxLength={60} onChange={(e) => edit({ merchant: e.target.value })} className="h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Nama toko di struk" />
          <Label>Tanggal</Label>
          <DateInput value={draft.date} onChange={(date) => edit({ date })} />
          <Label>Kategori</Label>
          <Chips options={cats} value={draft.category} onChange={(category) => edit({ category })} />

          <Label>Rincian barang</Label>
          <div className="space-y-2">
            {draft.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input aria-label={`Nama barang ${idx + 1}`} value={it.name} maxLength={60} onChange={(e) => editItem(idx, { name: e.target.value })} className={`h-11 min-w-0 flex-1 rounded-2xl border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring ${it.unsure ? "border-danger bg-danger-soft" : "border-border"}`} placeholder="Nama barang" />
                <div className="w-32 shrink-0"><MoneyInput label={`Harga barang ${idx + 1}`} value={it.price} onChange={(price) => editItem(idx, { price })} /></div>
                <button type="button" aria-label={`Hapus barang ${idx + 1}`} onClick={() => edit({ items: draft.items.filter((_, i) => i !== idx) })} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-1 h-9 px-2 text-xs text-primary" onClick={() => edit({ items: [...draft.items, { name: "", qty: 1, price: 0 }] })}><Plus size={14} /> Tambah barang</Button>

          <Label>Jumlah total</Label>
          <MoneyInput large label="Jumlah total" value={draft.total} onChange={(total) => edit({ total })} />
          {itemSum > 0 && itemSum !== draft.total && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">Jumlah rincian barang {rp(itemSum)}, berbeda dari total.<button type="button" className="font-bold text-primary" onClick={() => edit({ total: itemSum })}>Pakai {rp(itemSum)}</button></p>
          )}

          <Button className="mt-6 h-12 w-full" disabled={!draft.total} onClick={save}>Konfirmasi & simpan</Button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Tidak ada yang tersimpan sebelum kamu menekan tombol ini.</p>
        </section>
      )}
    </main>
  );
}
