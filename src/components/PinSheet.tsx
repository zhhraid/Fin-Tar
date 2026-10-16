import { Delete, KeyRound, Loader2, LockKeyhole, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmPassword, useAuth } from "@/lib/cloud";
import { clearStores } from "@/lib/financials";
import { useTranslation } from "@/lib/i18n";
import { checkPin, finishPinRequest, hasPin, lockRemaining, pinProblem, removePin, setPin, usePinRequest, type PinRequest } from "@/lib/pin";

type Step = "verify" | "create" | "confirm" | "forgot";

/** Mounted once at the app root; shows itself while a screen is waiting on requestPin(). */
export function PinGate() {
  const request = usePinRequest();
  return request ? <PinSheet key={request.purpose + request.kind} request={request} /> : null;
}

function PinSheet({ request }: { request: PinRequest }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [step, setStep] = useState<Step>(() => (hasPin() ? "verify" : "create"));
  const [digits, setDigits] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(() => lockRemaining());
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!locked) return;
    const id = window.setInterval(() => setLocked(lockRemaining()), 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  const lockText = (ms: number) => t("pinLocked", { m: Math.max(1, Math.ceil(ms / 60_000)) });

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      if (step === "verify") {
        const res = await checkPin(pin);
        if (res.result === "ok") {
          if (request.kind === "change") {
            setStep("create");
            setError(null);
          } else finishPinRequest(true);
        } else if (res.result === "locked") {
          setLocked(res.ms);
          setError(lockText(res.ms));
        } else setError(t("pinWrong", { n: res.left }));
      } else if (step === "create") {
        const problem = pinProblem(pin);
        if (problem) setError(t(problem === "repeat" ? "pinRuleRepeat" : problem === "sequence" ? "pinRuleSequence" : "pinRuleFormat"));
        else {
          setFirst(pin);
          setStep("confirm");
          setError(null);
        }
      } else if (step === "confirm") {
        if (pin !== first) {
          setStep("create");
          setFirst("");
          setError(t("pinMismatch"));
        } else {
          await setPin(pin);
          toast.success(t("pinSavedToast"));
          finishPinRequest(true);
        }
      }
      setDigits("");
      setBusy(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t and lockText only format text
    [step, first, request.kind],
  );

  const press = useCallback(
    (key: string) => {
      if (busy || locked || step === "forgot") return;
      if (key === "back") return setDigits(digits.slice(0, -1));
      const next = (digits + key).slice(0, 6);
      setDigits(next);
      if (next.length === 6) void submit(next);
    },
    [busy, locked, step, submit, digits],
  );

  // Desktop keyboards work too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") finishPinRequest(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const resetWithPassword = async () => {
    setBusy(true);
    if (await confirmPassword(password)) {
      removePin();
      setLocked(0);
      setPassword("");
      setStep("create");
      setError(null);
    } else setError(t("pinPasswordWrong"));
    setBusy(false);
  };
  const resetDevice = () => {
    if (!window.confirm(t("pinResetDeviceConfirm"))) return;
    clearStores();
    removePin();
    toast.success(t("pinResetDeviceToast"));
    finishPinRequest(false);
  };

  const title =
    step === "verify" ? t("pinEnterTitle")
    : step === "create" ? (request.kind === "change" && hasPin() ? t("pinNewTitle") : t("pinCreateTitle"))
    : step === "confirm" ? t("pinConfirmTitle")
    : t("pinForgotTitle");
  const hint = step === "create" ? t("pinCreateHint") : step === "confirm" ? t("pinConfirmHint") : request.purpose;

  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-foreground/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <div className="max-h-full w-full overflow-y-auto rounded-t-[2rem] bg-card p-6 pb-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">{step === "forgot" ? <KeyRound size={19} /> : <LockKeyhole size={19} />}</span>
            <div>
              <p className="text-xs font-bold text-primary">{t("pinEyebrow")}</p>
              <h2 id="pin-title" className="text-lg font-extrabold leading-tight">{title}</h2>
            </div>
          </div>
          <Button variant="icon" className="size-10 rounded-full p-0" onClick={() => finishPinRequest(false)} aria-label={t("close")}><X size={18} /></Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>

        {step === "forgot" ? (
          auth.status === "signedIn" ? (
            <div className="mt-4">
              <p className="text-xs leading-relaxed">{t("pinForgotCloud")}</p>
              <input aria-label={t("passwordLabel")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-3 h-11 w-full rounded-2xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder={t("passwordPlaceholder")} />
              {error && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{error}</p>}
              <Button className="mt-4 h-12 w-full" disabled={!password || busy} onClick={resetWithPassword}>{busy ? <Loader2 size={16} className="animate-spin" /> : t("pinVerifyPasswordBtn")}</Button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-xs leading-relaxed">{t("pinForgotDevice")}</p>
              <Button variant="destructive" className="mt-4 h-12 w-full text-xs" onClick={resetDevice}>{t("pinResetDeviceBtn")}</Button>
            </div>
          )
        ) : (
          <>
            <div className="mt-6 flex justify-center gap-3" aria-label={t("pinDigitsAria", { n: digits.length })}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={`size-3.5 rounded-full border-2 transition-colors ${i < digits.length ? "border-primary bg-primary" : "border-border"}`} />
              ))}
            </div>
            <p role="alert" className="mt-4 min-h-5 text-center text-xs font-semibold text-danger">{locked ? lockText(locked) : error}</p>
            <div className="mx-auto mt-2 grid max-w-xs grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <KeyButton key={d} label={d} onClick={() => press(d)} disabled={busy || Boolean(locked)} />
              ))}
              {step === "verify" ? (
                <button type="button" onClick={() => { setStep("forgot"); setError(null); }} className="h-14 rounded-2xl text-[11px] font-bold text-primary">{t("pinForgotBtn")}</button>
              ) : <span />}
              <KeyButton label="0" onClick={() => press("0")} disabled={busy || Boolean(locked)} />
              <button type="button" aria-label={t("pinBackspaceAria")} onClick={() => press("back")} disabled={busy || !digits} className="grid h-14 place-items-center rounded-2xl text-muted-foreground disabled:opacity-40"><Delete size={20} /></button>
            </div>
            {busy && <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><Loader2 size={13} className="animate-spin" /> {t("pinChecking")}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function KeyButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-14 rounded-2xl bg-muted text-xl font-bold tabular-nums transition-colors hover:bg-muted/70 active:bg-primary/15 disabled:opacity-40">
      {label}
    </button>
  );
}
