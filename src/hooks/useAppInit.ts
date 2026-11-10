import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { seedIfEmpty } from "../db/seed";
import { installSyncHooks, installBeaconFlushOnHide, pullAll, startPolling } from "../db/remoteSync";
import { clearOldExpensePhotos } from "../db/expenseReports";
import { requestPersistentStorage } from "../lib/persistentStorage";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import type { Role } from "../types";

// Receipt/waste photos are embedded as base64 directly in the expenseReports
// and expenses tables, and every sync push transfers each of those tables'
// ENTIRE history in one shot (see remoteSync.ts) — so with no cleanup, every
// push gets slower and more likely to time out on a weak connection as more
// photos pile up over months, regardless of how small today's own report is.
// A manual "Clear Photos" button already existed for this (Settings-adjacent,
// on the Expenses page), but only ever ran if an admin remembered to click
// it. Running it automatically, admin-only and throttled to once a day,
// keeps the synced payload from silently growing without bound in the
// common case where nobody does.
const AUTO_PHOTO_TRIM_KEY = "lakbai-pos-last-photo-trim";
const AUTO_PHOTO_TRIM_DAYS = 30;
const AUTO_PHOTO_TRIM_INTERVAL_MS = 24 * 60 * 60 * 1000;

function maybeAutoTrimOldPhotos(role: Role | undefined): void {
  if (role !== "admin") return;
  try {
    const last = Number(localStorage.getItem(AUTO_PHOTO_TRIM_KEY) ?? "0");
    if (Date.now() - last < AUTO_PHOTO_TRIM_INTERVAL_MS) return;
    localStorage.setItem(AUTO_PHOTO_TRIM_KEY, String(Date.now()));
  } catch {
    // Private browsing / storage disabled — just skip the throttle rather
    // than either spamming this on every boot or never running at all.
    return;
  }
  const cutoff = format(subDays(new Date(), AUTO_PHOTO_TRIM_DAYS), "yyyy-MM-dd");
  clearOldExpensePhotos(cutoff).catch(() => {
    // Best-effort housekeeping — never let a failure here affect the app.
  });
}

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
      // Catches an in-app browser (Messenger's, most notably) suspending or
      // killing its tab mid-save, before a normal push has a chance to
      // finish — see installBeaconFlushOnHide's own comment for why this
      // needs a dedicated mechanism rather than just a faster push.
      installBeaconFlushOnHide();
      // Ask the browser not to silently evict this app's local database
      // under storage pressure — see persistentStorage.ts. Fire-and-forget:
      // this is a courtesy request with no response to act on, and must
      // never hold up the rest of startup.
      void requestPersistentStorage();

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
        maybeAutoTrimOldPhotos(currentUser.role);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
