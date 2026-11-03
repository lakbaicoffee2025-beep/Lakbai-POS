export interface PersistentStorageStatus {
  supported: boolean;
  persisted: boolean;
}

/**
 * Asks the browser to exempt this origin's storage (IndexedDB — where
 * every bit of this app's local data lives) from its "clear
 * least-recently-used origins" eviction policy, which can trigger under
 * storage pressure (a phone that's low on space) even for an installed,
 * home-screen app. Without this, the OS/browser can silently clear the
 * entire local database with no warning and nothing left to even retry
 * syncing — indistinguishable from data just vanishing, which is exactly
 * what this is meant to prevent. Safe to call on every launch; it's a
 * no-op once already granted, and does nothing harmful if the browser
 * declines or doesn't support it.
 */
export async function requestPersistentStorage(): Promise<PersistentStorageStatus> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return { supported: false, persisted: false };
  }
  try {
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: true, persisted: false };
  }
}

/** Read-only check of the current grant, without (re-)requesting it. */
export async function getPersistentStorageStatus(): Promise<PersistentStorageStatus> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
    return { supported: false, persisted: false };
  }
  try {
    const persisted = await navigator.storage.persisted();
    return { supported: true, persisted };
  } catch {
    return { supported: true, persisted: false };
  }
}
