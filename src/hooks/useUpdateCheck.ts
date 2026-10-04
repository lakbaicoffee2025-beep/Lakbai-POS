import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const VERSION_URL = "/version.json";

async function fetchBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.buildId === "string" ? data.buildId : null;
  } catch {
    return null;
  }
}

/**
 * Detects when a newer build has been deployed while this page is still
 * open and running the code it originally loaded. There's no service
 * worker here to notice this on its own — and an installed home-screen app
 * in particular can sit resumed from a frozen background state for days
 * without ever doing a real reload, silently running old code (including
 * old, already-fixed bugs) the whole time unless something actively
 * checks. Polls periodically and whenever the app regains focus, which
 * lines up well with "someone just reopened the installed app."
 */
export function useUpdateCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let initialBuildId: string | null = null;
    let cancelled = false;

    async function check() {
      const current = await fetchBuildId();
      if (!current || cancelled) return;
      if (initialBuildId === null) {
        initialBuildId = current;
        return;
      }
      if (current !== initialBuildId) {
        setUpdateAvailable(true);
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return updateAvailable;
}
