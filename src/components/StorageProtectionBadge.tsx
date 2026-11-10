import { useEffect, useState } from "react";
import {
  getPersistentStorageStatus,
  requestPersistentStorage,
  type PersistentStorageStatus,
} from "../lib/persistentStorage";

/**
 * Lets anyone on this device — not just an admin, since Settings (where
 * this would otherwise live) is admin-only and staff are the ones actually
 * entering data day to day — see whether this phone's local data is
 * protected from the browser silently clearing it under storage pressure,
 * and fix it in one tap if not. Quiet when everything's fine; only speaks
 * up when there's something to actually check.
 */
export default function StorageProtectionBadge() {
  const [status, setStatus] = useState<PersistentStorageStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    getPersistentStorageStatus().then(setStatus);
  }, []);

  async function handleRequest() {
    setRequesting(true);
    try {
      setStatus(await requestPersistentStorage());
    } finally {
      setRequesting(false);
    }
  }

  // Not loaded yet, or the browser doesn't support checking at all —
  // nothing useful to show either way.
  if (!status || !status.supported || status.persisted) return null;

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2 text-xs">
      <span className="text-amber-800">
        This device's saved data isn't protected from being cleared if the phone runs low on
        storage. Tap to protect it.
      </span>
      <button
        onClick={handleRequest}
        disabled={requesting}
        className="shrink-0 font-semibold text-amber-900 underline disabled:opacity-50"
      >
        {requesting ? "…" : "Protect Now"}
      </button>
    </div>
  );
}
