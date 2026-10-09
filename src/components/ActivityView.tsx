import { ArrowLeft, Download, History, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMyData, useAuth } from "@/lib/cloud";
import { exportActivityJson } from "@/lib/export";
import { clearStores, setAiConsent, useActivity, useAiConsent, type Activity } from "@/lib/financials";
import { useTranslation } from "@/lib/i18n";

const tierClass: Record<Activity["tier"], string> = { T0: "bg-muted text-muted-foreground", T1: "bg-muted text-primary", T2: "bg-success-soft text-success", T3: "bg-danger-soft text-danger" };

export function ActivityView({ onBack }: { onBack: () => void }) {
  const rows = useActivity();
  const consent = useAiConsent();
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t, lang } = useTranslation();

  const tierLabel: Record<Activity["tier"], string> = {
    T0: t("tierRead"),
    T1: t("tierSuggest"),
    T2: t("tierAct"),
    T3: t("tierForbidden"),
  };

  const statusLabel: Record<Activity["status"], string> = {
    completed: t("statusCompleted"),
    approved: t("statusApproved"),
    rejected: t("statusRejected"),
    blocked: t("statusBlocked"),
  };

  const erase = async () => {
    setBusy(true);
    if (auth.status === "signedIn") {
      const error = await deleteMyData();
      if (error) toast.error(lang === "en" ? `Failed to delete data: ${error}` : `Gagal menghapus data: ${error}`);
      else toast.success(t("dataDeletedServerToast"));
    } else {
      clearStores();
      toast.success(t("dataDeletedDeviceToast"));
      onBack();
    }
    setBusy(false);
    setConfirming(false);
  };

  return (
    <main className="pb-6">
      <header className="flex items-center gap-3 px-5 pb-2 pt-6">
        <Button variant="icon" size="icon" className="rounded-full" onClick={onBack} aria-label={t("back")}><ArrowLeft size={18} /></Button>
        <div><p className="text-xs font-bold text-primary">{t("activityLogEyebrow")}</p><h1 className="text-xl font-extrabold">{t("activityLogHeader")}</h1></div>
      </header>

      <div className="px-5">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t("activityLogDesc")}{auth.status === "signedIn" ? t("activityServerNote") : ""}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11 text-xs" disabled={!rows.length} onClick={() => exportActivityJson(rows)}><Download size={15} /> {t("downloadLogBtn")}</Button>
          <Button variant="secondary" className="h-11 text-xs" disabled={!consent} onClick={() => { setAiConsent(false); toast.success(t("aiConsentRevokedToast")); }}><ShieldOff size={15} /> {consent ? t("revokeAiConsentBtn") : t("aiConsentInactiveBtn")}</Button>
        </div>

        <h2 className="mb-3 mt-7 flex items-center gap-2 font-bold"><History size={16} className="text-primary" /> {t("historySection")} ({rows.length})</h2>
        {!rows.length && <p className="rounded-2xl bg-muted p-4 text-center text-xs text-muted-foreground">{t("noActivityYet")}</p>}
        <ol className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold leading-snug">{a.summary || a.tool}</p>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${tierClass[a.tier]}`}>{a.tier} • {tierLabel[a.tier]}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{new Date(a.at).toLocaleString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} • {statusLabel[a.status]} • <span className="font-mono">{a.tool}</span></p>
            </li>
          ))}
        </ol>

        <h2 className="mt-8 font-bold">{t("deleteAllDataSection")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("deleteAllDataDesc", { location: auth.status === "signedIn" ? t("fromServer") : t("fromDevice") })}</p>
        {confirming ? (
          <div className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-bold text-danger">{t("confirmDeletePrompt")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="h-11 text-xs" disabled={busy} onClick={() => setConfirming(false)}>{t("cancel")}</Button>
              <Button variant="destructive" className="h-11 text-xs" disabled={busy} onClick={erase}>{t("yesDeletePermanently")}</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-3 h-11 w-full text-xs text-danger" onClick={() => setConfirming(true)}><Trash2 size={15} /> {t("deleteAllDataSection")}</Button>
        )}
      </div>
    </main>
  );
}
