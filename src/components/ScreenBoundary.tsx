import { Component, type ReactNode } from "react";
import { getLanguage } from "@/lib/i18n";

// Keeps a crash in one screen from taking down the whole app, and shows the error text so a
// user can report it. `onReset` clears whatever saved state the screen depends on.
export class ScreenBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const en = getLanguage() === "en";
    return (
      <main className="px-5 pb-6 pt-8 text-center">
        <h1 className="text-lg font-extrabold">{en ? "This screen hit an error" : "Layar ini mengalami error"}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{en ? "The rest of the app still works. Please send a screenshot of the details below." : "Bagian lain aplikasi tetap jalan. Kirim screenshot detail di bawah ini."}</p>
        <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-left font-mono text-[10px] leading-relaxed">{`${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(0, 6).join("\n")}\n${typeof navigator === "undefined" ? "" : navigator.userAgent}`}</pre>
        <button
          type="button"
          className="mt-4 h-11 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground"
          onClick={() => {
            this.props.onReset?.();
            this.setState({ error: null });
          }}
        >
          {en ? "Reset and try again" : "Reset dan coba lagi"}
        </button>
      </main>
    );
  }
}
