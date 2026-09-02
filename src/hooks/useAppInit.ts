import { useEffect, useState } from "react";
import { seedIfEmpty } from "../db/seed";
import { installSyncHooks, pullAll, pushAll, startPolling } from "../db/remoteSync";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";

export function useAppInit() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  const currentUser = useAuthStore((s) => s.currentUser);
  const refreshCurrentUser = useAuthStore((s) => s.refreshCurrentUser);
  const loadActiveShift = useShiftStore((s) => s.loadActiveShift);

  useEffect(() => {
    (async () => {
      // Push-on-write must be armed before anything (including seeding)
      // writes to the DB, so those writes queue up for sync too.
      installSyncHooks();

      // Prefer whatever the other devices already have. If nothing comes
      // back (first device ever, or the sync endpoint isn't reachable —
      // e.g. local `vite` dev without Netlify Functions), fall back to
      // local seeding exactly as before, then publish that seed as the
      // shared baseline for any device that syncs in afterward.
      const hydrated = await pullAll();
      if (!hydrated) {
        const didSeed = await seedIfEmpty();
        if (didSeed) await pushAll();
      }

      startPolling();

      await loadSettings();
      if (currentUser) {
        await refreshCurrentUser();
        await loadActiveShift(currentUser.id);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
