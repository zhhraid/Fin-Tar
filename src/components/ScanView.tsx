import { Camera, ImageUp, Loader2, PackageCheck, ReceiptText, ScanLine, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { rp } from "@/lib/financials";

type ScanResult = { merchant: string; date: string; items: { name: string; qty: number; price: number }[]; total: number };

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ScanView({ onClose }: { onClose: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [saved, setSaved] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const dataUrl = await toDataUrl(file);
      setPhoto(dataUrl);
      const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: dataUrl }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membaca struk.");
      if (!data.items.length) throw new Error("Tidak ada struk terdeteksi. Coba foto ulang dengan lebih jelas.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membaca struk.");
    } finally {
      setLoading(false);
    }
  };

  if (saved && result)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-8 text-center">
        <div>
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><PackageCheck size={38} /></div>
          <h1 className="mt-5 text-2xl font-extrabold">Transaksi tersimpan</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Pengeluaran {rp(result.total)} dari {result.merchant || "struk"} sudah masuk ke laporan.</p>
          <Button className="mt-7 h-12 w-full" onClick={onClose}>Kembali ke beranda</Button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-brand-dark text-brand-dark-foreground">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <header className="flex items-center justify-between p-5">
        <div><p className="text-xs font-bold text-primary">PEMINDAI STRUK • OCR</p><h1 className="mt-1 text-lg font-bold">Foto nota belanjamu</h1></div>
        <Button variant="ghost" className="size-10 rounded-full p-0 text-brand-dark-foreground hover:bg-card/10 hover:text-brand-dark-foreground" onClick={onClose} aria-label="Tutup"><X /></Button>
      </header>

      <div className="px-5">
        <div className="relative grid h-80 place-items-center overflow-hidden rounded-3xl border border-card/20 bg-card/5">
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
        {!photo && !error && <p className="mt-3 text-center text-xs opacity-60">Pastikan seluruh struk terlihat dan tulisannya jelas</p>}
      </div>

      {result && (
        <section className="mt-6 rounded-t-[2rem] bg-card p-6 pb-10 text-foreground">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><ScanLine /></div>
            <div><h2 className="font-bold">{result.merchant || "Data berhasil dibaca"}</h2><p className="text-xs text-muted-foreground">{result.date || "Periksa sebelum disimpan"}</p></div>
          </div>
          <div className="space-y-3 text-sm">
            {result.items.map((i, idx) => (
              <div key={idx} className="flex justify-between gap-4"><span>{i.name}{i.qty > 1 ? ` × ${i.qty}` : ""}</span><span className="shrink-0 tabular-nums">{rp(i.price)}</span></div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-3 font-bold"><span>Jumlah total</span><span className="tabular-nums">{rp(result.total)}</span></div>
          </div>
          <Button className="mt-6 h-12 w-full" onClick={() => setSaved(true)}>Konfirmasi & simpan</Button>
        </section>
      )}
    </main>
  );
}
