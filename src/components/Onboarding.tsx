import {
  BarChart3,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

type Step = { icon: typeof BarChart3; title: string; description: string };

export function Onboarding({
  onComplete,
  onOpenProfile,
}: {
  onComplete: () => void;
  onOpenProfile: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const steps: Step[] = [
    { icon: BarChart3, title: t("onboardingStep1Title"), description: t("onboardingStep1Desc") },
    {
      icon: CircleDollarSign,
      title: t("onboardingStep2Title"),
      description: t("onboardingStep2Desc"),
    },
    {
      icon: BookOpenCheck,
      title: t("onboardingStep3Title"),
      description: t("onboardingStep3Desc"),
    },
    { icon: Sparkles, title: t("onboardingStep4Title"), description: t("onboardingStep4Desc") },
  ];
  const current = steps[step]!;
  const Icon = current.icon;
  const last = step === steps.length - 1;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-end bg-foreground/35 p-3 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full overflow-hidden rounded-[1.75rem] border border-border/80 bg-card shadow-2xl sm:mx-auto sm:max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
            <Sparkles size={13} /> {t("onboardingEyebrow")}
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onComplete}
            aria-label={t("skipOnboardingBtn")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="px-5 pb-5 pt-6">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Icon size={27} strokeWidth={2.2} />
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("onboardingStepCount", { current: step + 1, total: steps.length })}
          </p>
          <h1 id="onboarding-title" className="mt-1 text-xl font-black tracking-tight">
            {current.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {current.description}
          </p>
          <div className="mt-6 flex gap-1.5" aria-label={t("onboardingProgressLabel")}>
            {steps.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 flex-1 rounded-full transition-colors ${index <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          {step === 2 && (
            <Button className="mt-5 h-11 w-full text-xs" onClick={onOpenProfile}>
              {t("openProfileOnboardingBtn")} <BookOpenCheck size={15} />
            </Button>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-10 items-center gap-1 rounded-xl px-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onComplete}
            >
              {t("skipOnboardingBtn")}
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10"
                  onClick={() => setStep(step - 1)}
                  aria-label={t("previousOnboardingBtn")}
                >
                  <ChevronLeft size={17} />
                </Button>
              )}
              <Button
                className="h-10 px-4 text-xs"
                onClick={() => (last ? onComplete() : setStep(step + 1))}
              >
                {last
                  ? t("finishOnboardingBtn")
                  : step === 2
                    ? t("laterOnboardingBtn")
                    : t("nextOnboardingBtn")}
                {last ? <BookOpenCheck size={15} /> : <ChevronRight size={15} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
