import { Loader2, MailCheck, Sparkles, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/fields";
import { signIn, signUp } from "@/lib/cloud";
import { useTranslation } from "@/lib/i18n";

const fieldClass = "h-11 w-full rounded-xl border border-border/80 bg-background/60 px-3.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20";

export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { t } = useTranslation();

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
      <main className="h-full w-full overflow-y-auto app-scroll flex flex-col justify-center items-center px-6 py-8 text-center">
        <div className="w-full max-w-xs my-auto">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-inner">
            <MailCheck size={32} />
          </div>
          <h1 className="mt-5 text-xl font-black tracking-tight">{t("checkEmailTitle")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("checkEmailDesc", { email })}</p>
          <Button className="mt-6 h-11 w-full text-xs font-bold rounded-xl shadow-md" onClick={() => { setConfirm(false); setMode("in"); }}>
            {t("toSignInPageBtn")}
          </Button>
        </div>
      </main>
    );

  return (
    <main className="h-full w-full overflow-y-auto app-scroll px-5 py-6 sm:px-6">
      <div className="flex min-h-full w-full items-center justify-center">
        <div className="my-auto flex w-full max-w-sm flex-col py-2">
        {/* Brand Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border border-primary/20 shadow-sm mb-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
              <TrendingUp size={20} />
            </div>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center justify-center gap-1.5">
            Fin<span className="text-primary">Tar</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Sparkles size={10} /> Copilot
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{mode === "in" ? t("signInDesc") : t("signUpDesc")}</p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-muted/80 rounded-xl border border-border/60 mb-4">
          <button
            type="button"
            onClick={() => { setMode("in"); setError(null); }}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === "in" ? "bg-card text-primary shadow-xs font-extrabold" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("signInBtn")}
          </button>
          <button
            type="button"
            onClick={() => { setMode("up"); setError(null); }}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === "up" ? "bg-card text-primary shadow-xs font-extrabold" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("signUpBtn")}
          </button>
        </div>

        {/* Card Form */}
        <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs p-4 sm:p-5 shadow-xs">
          <h2 className="text-sm font-extrabold text-foreground mb-3">
            {mode === "in" ? t("signInHeading") : t("signUpHeading")}
          </h2>

          <form onSubmit={submit} className="space-y-3">
            {mode === "up" && (
              <div>
                <Label>{t("businessNameLabel")}</Label>
                <div className="relative mt-1">
                  <input
                    aria-label={t("businessNameLabel")}
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                    maxLength={40}
                    required
                    className={fieldClass}
                    placeholder={t("businessNamePlaceholder")}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>{t("emailLabel")}</Label>
              <div className="relative mt-1">
                <input
                  aria-label={t("emailLabel")}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder={t("emailPlaceholder")}
                />
              </div>
            </div>
            <div>
              <Label>{t("passwordLabel")}</Label>
              <div className="relative mt-1">
                <input
                  aria-label={t("passwordLabel")}
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={fieldClass}
                  placeholder={t("passwordPlaceholder")}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-danger-soft/90 border border-danger/20 p-2.5 text-[11px] font-semibold text-danger leading-relaxed">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="mt-2 h-11 w-full rounded-xl text-xs font-bold shadow-md shadow-primary/20 transition-transform active:scale-[0.98]"
              disabled={busy}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : (mode === "in" ? t("signInBtn") : t("signUpBtn"))}
            </Button>
          </form>
        </div>

        {/* Footer switch prompt */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "in" ? t("noAccountText") : t("haveAccountText")}{" "}
          <button
            type="button"
            className="font-bold text-primary hover:underline underline-offset-2 ml-1"
            onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}
          >
            {mode === "in" ? t("signUpBtn") : t("signInBtn")}
          </button>
        </p>
        </div>
      </div>
    </main>
  );
}
