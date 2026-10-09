import { useSyncExternalStore } from "react";

// Chrome's install prompt event; not in the DOM lib typings.
type InstallEvent = Event & { prompt: () => Promise<void> };

let installEvent: InstallEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Registers the service worker and keeps the install prompt for the "Pasang aplikasi" button. */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    notify();
  });
  // Skipped in dev so cached files never mask hot reloads.
  if (import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/** Returns a function that opens the install prompt, or null when the browser has not offered one. */
export function useInstallPrompt() {
  const ev = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => installEvent,
    () => null,
  );
  return ev
    ? () => {
        void ev.prompt();
        installEvent = null;
        notify();
      }
    : null;
}
