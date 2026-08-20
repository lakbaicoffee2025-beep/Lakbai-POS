import { db } from "./db";
import { useSettingsStore } from "../store/settingsStore";

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

// Device-local safety-net data that should never leave this browser — e.g.
// the in-progress cart autosave, which only exists so an accidental reload
// on *this* device doesn't lose an unfinished sale. Not part of the shared
// cross-device dataset.
const LOCAL_ONLY_TABLES = new Set(["draftCarts"]);

// A write is only safe from an incoming pull once it has actually reached
// the server — until then, pulling would clear()+bulkAdd() this table back
// to the server's stale copy and destroy the local write. The debounce
// timer that eventually pushes it lives only in memory, so a reload before
// it fires would normally lose track of what's still unpushed; mirroring
// the dirty set into localStorage lets the next boot pick up exactly where
// this session left off and flush it before pulling anything.
const PENDING_KEY = "lakbai-pos-pending-push";

function persistPending(): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(dirtyTables)));
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

function readPersistedPending(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

const dirtyTables = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;
let hooksInstalled = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pushTable(name: string): Promise<void> {
  if (LOCAL_ONLY_TABLES.has(name)) return;
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

/** Pushes and clears whatever is currently queued in memory, right now. */
async function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const tables = Array.from(dirtyTables);
  dirtyTables.clear();
  persistPending();
  if (tables.length > 0) {
    await Promise.all(tables.map(pushTable));
  }
}

/** Pushes and clears whatever a previous session left queued but never flushed
 * (e.g. it was reloaded/closed within the debounce window). */
async function flushPersistedLeftovers(): Promise<void> {
  const leftover = readPersistedPending().filter((n) => !LOCAL_ONLY_TABLES.has(n));
  if (leftover.length > 0) {
    await Promise.all(leftover.map(pushTable));
  }
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

function scheduleFlush(): void {
  persistPending();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, PUSH_DEBOUNCE_MS);
}

export function installSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const table of db.tables) {
    if (LOCAL_ONLY_TABLES.has(table.name)) continue;
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
  // Always push before pulling — otherwise a pull could clear()+bulkAdd()
  // a table right out from under a write that's still queued (this
  // session's own debounce window, or one left over from a session that
  // reloaded/crashed before it fired), silently reverting it to the
  // server's stale copy.
  await flushPersistedLeftovers();
  await flushNow();
  try {
    const res = await fetch(`${SYNC_URL}?all=1`);
    if (!res.ok) return false;
    const remote = (await res.json()) as Record<string, unknown[] | null>;
    const tableNames = new Set(db.tables.map((t) => t.name));
    const present = Object.keys(remote).filter(
      (k) => tableNames.has(k) && !LOCAL_ONLY_TABLES.has(k) && Array.isArray(remote[k])
    );
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

    // Settings is cached in a plain Zustand store (not a live query), so an
    // admin's change on another device wouldn't otherwise reach an
    // already-open session here until a manual reload. Refresh it whenever
    // this pull actually touched settings.
    if (present.includes("settings")) {
      await useSettingsStore.getState().load();
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
