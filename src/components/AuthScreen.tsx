import { Loader2, MailCheck, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/fields";
import { signIn, signUp } from "@/lib/cloud";

const field = "h-12 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-ring";

export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    if (mode === "in") setError(await signIn(email.trim(), password));
    else {
      const res = await signUp(email.trim(), password, business);
      setError(res.error);
      setConfirm(res.confirm);
    }
    setBusy(false);
  };

  if (confirm)
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center sm:min-h-[880px]">
        <div>
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><MailCheck size={36} /></div>
          <h1 className="mt-5 text-2xl font-extrabold">Cek email kamu</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Kami mengirim tautan konfirmasi ke {email}. Buka tautan itu, lalu masuk di sini.</p>
          <Button className="mt-7 h-12 w-full" onClick={() => { setConfirm(false); setMode("in"); }}>Ke halaman masuk</Button>
        </div>
      </main>
    );

  return (
    <main className="flex min-h-screen flex-col justify-center px-6 py-10 sm:min-h-[880px]">
      <div className="flex items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><TrendingUp size={21} /></div>
        <h1 className="text-2xl font-extrabold text-primary">FinTar</h1>
      </div>
      <h2 className="mt-8 text-2xl font-extrabold">{mode === "in" ? "Masuk ke akunmu" : "Buat akun usaha"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{mode === "in" ? "Catatan keuanganmu tersimpan aman di akun ini." : "Gratis. Catatanmu bisa dibuka dari HP mana pun."}</p>

      <form onSubmit={submit}>
        {mode === "up" && (<><Label>Nama usaha</Label><input aria-label="Nama usaha" value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={40} required className={field} placeholder="Contoh: Viera Bakery" /></>)}
        <Label>Email</Label>
        <input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} placeholder="nama@email.com" />
        <Label>Kata sandi</Label>
        <input aria-label="Kata sandi" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={field} placeholder="Minimal 6 karakter" />
        {error && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">{error}</p>}
        <Button type="submit" className="mt-6 h-12 w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}{mode === "in" ? "Masuk" : "Daftar"}</Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "in" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
        <button type="button" className="font-bold text-primary" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>{mode === "in" ? "Daftar" : "Masuk"}</button>
      </p>
    </main>
  );
}
