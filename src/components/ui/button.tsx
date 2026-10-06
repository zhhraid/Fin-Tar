import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "income" | "expense" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  income: "bg-success-soft text-success hover:bg-success-soft/70",
  expense: "bg-danger-soft text-danger hover:bg-danger-soft/70",
  icon: "bg-muted text-muted-foreground hover:text-primary",
};

export function Button({ className, variant = "primary", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}