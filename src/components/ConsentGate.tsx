import { Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { setAiConsent, useAiConsent } from "@/lib/financials";
import { useTranslation } from "@/lib/i18n";

/** Shows its children only after the user has allowed AI processing of their records. */
export function ConsentGate({ feature, children, footer }: { feature: string; children: ReactNode; footer?: ReactNode }) {
  const granted = useAiConsent();
  const { t } = useTranslation();
  if (granted) return <>{children}</>;
  return (
    <div className="mx-5 my-6 rounded-3xl border border-border bg-card p-6 text-center text-foreground">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-primary"><ShieldCheck size={26} /></div>
      <h2 className="mt-4 text-lg font-extrabold">{t("allowAiForTitle", { feature })}</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("consentPdpNotice")}</p>
      <ul className="mt-4 space-y-2 rounded-2xl bg-muted p-4 text-left text-xs leading-relaxed text-muted-foreground">
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> {t("consentPoint1")}</li>
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> {t("consentPoint2")}</li>
        <li className="flex gap-2"><Lock size={13} className="mt-0.5 shrink-0 text-primary" /> {t("consentPoint3")}</li>
      </ul>
      <Button className="mt-5 h-12 w-full" onClick={() => setAiConsent(true)}>{t("iAgreeBtn")}</Button>
      {footer}
    </div>
  );
}
