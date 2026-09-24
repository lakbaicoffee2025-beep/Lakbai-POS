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

      // Prefer whatever the other devices already have. Only fall back to
      // local seeding — and publishing that seed as the new shared
      // baseline — when the server was actually reached and confirmed to
      // have nothing yet (a genuinely first-ever run, or local `vite` dev
      // without Netlify Functions, where every pull consistently reports
      // "empty"). A pull that merely *failed* (offline, a flaky request,
      // an unreachable endpoint) must NOT take this path: if this
      // device's own local storage also happens to be empty at that same
      // moment (fresh browser, a new/reinstalled device, evicted storage),
      // seeding demo data and pushing it as the baseline would silently
      // overwrite every other device's real synced data with it — exactly
      // what caused a shop's whole catalog and staff accounts to be wiped
      // and replaced with the default demo seed.
      const pullResult = await pullAll();
      if (pullResult === "empty") {
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
