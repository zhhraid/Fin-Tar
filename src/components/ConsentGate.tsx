import { Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { setAiConsent, useAiConsent } from "@/lib/financials";

/** Shows its children only after the user has allowed AI processing of their records. */
export function ConsentGate({ feature, children, footer }: { feature: string; children: ReactNode; footer?: ReactNode }) {
  const granted = useAiConsent();
  if (granted) return <>{children}</>;
  return (
    <div className="mx-5 my-6 rounded-3xl border border-border bg-card p-6 text-center text-foreground">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-primary"><ShieldCheck size={26} /></div>
      <h2 className="mt-4 text-lg font-extrabold">Izinkan AI untuk {feature}?</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">FinTar baru mengirim catatanmu ke layanan AI setelah kamu setuju, sesuai prinsip UU Pelindungan Data Pribadi.</p>
      <ul className="mt-4 space-y-2 rounded-2xl bg-muted p-4 text-left text-xs leading-relaxed text-muted-foreground">
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> Yang dikirim: ringkasan transaksi, atau foto struk yang kamu pindai.</li>
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> AI hanya memberi saran. Tidak ada yang tersimpan tanpa konfirmasimu.</li>
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> Izin bisa dicabut kapan saja di Profil.</li>
      </ul>
      <Button className="mt-5 h-12 w-full" onClick={() => setAiConsent(true)}>Saya setuju</Button>
      {footer}
    </div>
  );
}
