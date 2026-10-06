import { useEffect, useState } from "react";
import { seedIfEmpty } from "../db/seed";
import { installSyncHooks, pullAll, startPolling } from "../db/remoteSync";
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
      // local seeding when the server was actually reached and confirmed to
      // have nothing yet (a genuinely first-ever run, or local `vite` dev
      // without Netlify Functions). A pull that merely *failed* (offline, a
      // flaky request, an unreachable endpoint) must NOT take this path —
      // see the tri-state result in remoteSync.ts for why.
      //
      // Deliberately NOT calling pushAll() here even on a confirmed-empty
      // result. pushAll() blindly *replaces* every table on the server with
      // this device's local copy — so if "empty" is ever a false signal
      // (e.g. the server's key-listing lagging behind on a freshly-started
      // function instance right after a deploy, a known class of
      // eventual-consistency issue for blob/object stores — not something
      // this client can fully rule out just by getting a response back),
      // that replace wipes whatever real data is actually there. The sync
      // hooks are already armed above, so these seeded rows reach the
      // server through the normal per-table *merge* push instead, which
      // unions local rows with whatever the server actually has rather than
      // overwriting it. Worst case on a false "empty": a few demo rows
      // appear alongside real data — never a wipe. This combination (a
      // confirmed-empty check, AND never auto-replacing on the strength of
      // it alone) is what previously let a shop's whole product/inventory
      // catalog and staff accounts get silently wiped and replaced with the
      // default demo seed, more than once.
      const pullResult = await pullAll();
      if (pullResult === "empty") {
        await seedIfEmpty();
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
