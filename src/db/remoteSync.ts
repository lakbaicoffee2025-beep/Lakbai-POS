import { db } from "./db";

/**
 * Cross-device sync over a Netlify Function backed by Netlify Blobs (same
 * pattern already used by the sibling LAKBAI apps): every Dexie table is
 * mirrored to one blob key holding that table's full current array. Devices
 * push their own writes (debounced) and poll for everyone else's.
 *
 * This is a progressive enhancement, not a requirement — every network call
 * here fails silently. Without Netlify Functions available (local `vite`
 * dev, a plain static host, or just being offline), the app keeps working
 * exactly as it always has: purely on the local IndexedDB copy.
 */

const SYNC_URL = "/api/sync";
const PUSH_DEBOUNCE_MS = 800;
const POLL_INTERVAL_MS = 8000;

const dirtyTables = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;
let hooksInstalled = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pushTable(name: string): Promise<void> {
  try {
    const rows = await db.table(name).toArray();
    await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: name, value: rows }),
    });
  } catch {
    // Offline or sync endpoint unavailable — local write already succeeded,
    // it just won't be visible to other devices until the next successful push.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const tables = Array.from(dirtyTables);
    dirtyTables.clear();
    await Promise.all(tables.map(pushTable));
  }, PUSH_DEBOUNCE_MS);
}

export function installSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const table of db.tables) {
    const markDirty = () => {
      if (hydrating) return;
      dirtyTables.add(table.name);
      scheduleFlush();
    };
    table.hook("creating", () => {
      markDirty();
    });
    table.hook("updating", () => {
      markDirty();
    });
    table.hook("deleting", () => {
      markDirty();
    });
  }
}

/** Pulls every table's latest snapshot from the server and replaces local data with it. */
export async function pullAll(): Promise<boolean> {
  try {
    const res = await fetch(`${SYNC_URL}?all=1`);
    if (!res.ok) return false;
    const remote = (await res.json()) as Record<string, unknown[] | null>;
    const tableNames = new Set(db.tables.map((t) => t.name));
    const present = Object.keys(remote).filter((k) => tableNames.has(k) && Array.isArray(remote[k]));
    if (present.length === 0) return false;

    hydrating = true;
    try {
      await db.transaction("rw", present.map((name) => db.table(name)), async () => {
        for (const name of present) {
          const rows = remote[name] as unknown[];
          await db.table(name).clear();
          if (rows.length > 0) await db.table(name).bulkAdd(rows);
        }
      });
    } finally {
      hydrating = false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Pushes every local table up as the initial shared baseline (first device ever to seed). */
export async function pushAll(): Promise<void> {
  await Promise.all(db.tables.map((t) => pushTable(t.name)));
}

/**
 * Pushes specific tables immediately. Needed after any write that bypasses
 * the creating/updating/deleting hooks — most notably `table.clear()`,
 * which Dexie deliberately does not fire hooks for, so a bulk wipe (like
 * the Settings "Reset Menu & Inventory" / "Factory Reset" actions) would
 * otherwise never reach the server and get silently overwritten by the
 * next poll pulling the old data back.
 */
export async function pushTables(names: string[]): Promise<void> {
  await Promise.all(names.map(pushTable));
}

export function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    pullAll();
  }, POLL_INTERVAL_MS);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
