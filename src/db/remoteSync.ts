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
const LOCAL_ONLY_TABLES = new Set([
  "draftCarts",
  "expenseDrafts",
  "restockDrafts",
  "inventoryCountDrafts",
  "spoilageDrafts",
  "purchaseOrderDrafts",
  // Held tickets are mutated frequently (hold/resume/delete) from whichever
  // register is working them. Syncing a frequently-mutated table via
  // full-snapshot-replace is exactly the case that loses data: any device
  // that hasn't polled in the last few seconds pushes its own stale view
  // and silently wipes out a ticket another device just added. Scoping
  // this to one device (like the cart draft already is) removes that race
  // entirely — a ticket is only ever resumed on the register that held it.
  "openTickets",
]);

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

// Row ids deleted locally (per table) since the last successful push of
// that table. A plain "push my current local array" would otherwise be
// unable to tell "this device never had this row" apart from "this device
// deleted this row" once it's merged against the server's copy below — both
// just look like an id that's missing locally. Tracking deletions
// explicitly lets the merge tell those apart and keep the delete instead of
// silently resurrecting the row from the server.
const pendingDeletes = new Map<string, Set<unknown>>();
const PENDING_DELETES_KEY = "lakbai-pos-pending-deletes";

function persistPendingDeletes(): void {
  try {
    const obj: Record<string, unknown[]> = {};
    for (const [table, ids] of pendingDeletes) obj[table] = Array.from(ids);
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(obj));
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

function loadPendingDeletes(): void {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, unknown[]>;
    for (const [table, ids] of Object.entries(obj)) {
      pendingDeletes.set(table, new Set(ids));
    }
  } catch {
    // ignore
  }
}
loadPendingDeletes();

function markDeleted(tableName: string, id: unknown): void {
  let set = pendingDeletes.get(tableName);
  if (!set) {
    set = new Set();
    pendingDeletes.set(tableName, set);
  }
  set.add(id);
  persistPendingDeletes();
}

// The server wraps every key as { rev, data } (see netlify/functions/sync.mjs)
// so a push can be conditioned on "only write if the revision I read is
// still current" — see pushTable below.
type RemoteEntry = { rev: number; data: unknown[] | null };

async function fetchRemoteEntry(name: string): Promise<RemoteEntry | null> {
  try {
    const res = await fetch(`${SYNC_URL}?k=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const entry = (await res.json()) as RemoteEntry;
    return typeof entry?.rev === "number" ? entry : null;
  } catch {
    return null;
  }
}

// Rows only known locally win on id conflicts (this device's write is
// presumably the reason it's pushing); rows only known remotely are folded
// in so this push can't erase them; rows this device explicitly deleted
// (tracked in pendingDeletes) are kept out even if the server still has
// them.
function mergeRows(name: string, localRows: unknown[], remoteRows: unknown[] | null): unknown[] {
  if (!Array.isArray(remoteRows)) return localRows;
  const deletedIds = pendingDeletes.get(name);
  const byId = new Map<unknown, unknown>();
  for (const row of remoteRows) {
    const id = (row as { id?: unknown })?.id;
    if (deletedIds?.has(id)) continue;
    byId.set(id, row);
  }
  for (const row of localRows) {
    byId.set((row as { id?: unknown })?.id, row);
  }
  return Array.from(byId.values());
}

// How many times to re-merge-and-retry a push that loses a revision race
// before giving up for this cycle (it stays dirty and is retried on the
// next poll regardless, so this just bounds how long one push attempt can
// spend fighting a genuinely hot key).
const MAX_PUSH_RETRIES = 3;

/**
 * Pushes a table's current local rows, merged against the server's current
 * copy instead of blindly overwriting it — otherwise any device whose local
 * copy has simply fallen a few seconds behind (a backgrounded/throttled
 * browser tab is the common case) can push its stale snapshot and wipe out
 * rows another device already synced in the meantime, even ones that have
 * nothing to do with what this device is actually pushing.
 *
 * The merge alone still has a race window between reading the server's
 * current copy and writing the merged result back — normally tiny, but a
 * slow or flaky connection (a small shop's wifi) can stretch that window
 * back open. So the write is conditioned on the revision this device read
 * (expectedRev): if another push landed in between, the server refuses it
 * (409) and hands back its now-current state, which gets re-merged and
 * retried instead of clobbering that other write.
 */
async function pushTable(name: string): Promise<boolean> {
  if (LOCAL_ONLY_TABLES.has(name)) return true;
  try {
    const localRows = await db.table(name).toArray();
    let remote = await fetchRemoteEntry(name);

    for (let attempt = 0; attempt <= MAX_PUSH_RETRIES; attempt++) {
      const toSend = remote ? mergeRows(name, localRows, remote.data) : localRows;
      const body = remote
        ? { key: name, value: toSend, expectedRev: remote.rev }
        : { key: name, value: toSend };
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        if (pendingDeletes.has(name)) {
          pendingDeletes.delete(name);
          persistPendingDeletes();
        }
        return true;
      }

      if (res.status === 409) {
        const conflict = (await res.json()) as { rev: number; data: unknown[] | null };
        remote = { rev: conflict.rev, data: conflict.data };
        continue;
      }

      return false;
    }
    return false;
  } catch {
    // Offline, sync endpoint unavailable, or the request itself failed
    // (timeout, dropped connection, payload rejected) — the local write
    // already succeeded, it just hasn't reached the server yet. Reporting
    // this as a failure (rather than silently swallowing it) is what lets
    // pullAll below know not to overwrite this table with a stale
    // server copy that doesn't have this write in it yet.
    return false;
  }
}

/**
 * Pushes a table's current local rows as-is, replacing whatever the server
 * has with no merge. Only for callers that just did a bulk wipe (Dexie's
 * `clear()` doesn't fire hooks, so those rows were never tracked as
 * pendingDeletes) and genuinely mean "this local state is now the entire
 * truth, discard anything else the server has" — e.g. resetting the menu
 * or a factory reset. Every other caller should use pushTable/pushTables
 * so a routine push can't clobber rows another device already synced.
 */
async function pushTableReplacing(name: string): Promise<boolean> {
  if (LOCAL_ONLY_TABLES.has(name)) return true;
  try {
    const rows = await db.table(name).toArray();
    const res = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: name, value: rows }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pushes and clears whatever is currently queued in memory, right now.
 * Returns the names of any tables that failed to push — those stay marked
 * dirty (re-added to dirtyTables) so the next flush retries them, instead
 * of being silently dropped.
 */
async function flushNow(): Promise<Set<string>> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const tables = Array.from(dirtyTables);
  dirtyTables.clear();
  persistPending();
  const failed = new Set<string>();
  if (tables.length > 0) {
    const results = await Promise.all(
      tables.map(async (name) => [name, await pushTable(name)] as const)
    );
    for (const [name, ok] of results) {
      if (!ok) {
        failed.add(name);
        dirtyTables.add(name);
      }
    }
    if (failed.size > 0) persistPending();
  }
  return failed;
}

/**
 * Pushes and clears whatever a previous session left queued but never
 * flushed (e.g. it was reloaded/closed within the debounce window).
 * Returns any table names that failed to push, for the same reason as
 * flushNow above.
 */
async function flushPersistedLeftovers(): Promise<Set<string>> {
  const leftover = readPersistedPending().filter((n) => !LOCAL_ONLY_TABLES.has(n));
  const failed = new Set<string>();
  if (leftover.length > 0) {
    const results = await Promise.all(
      leftover.map(async (name) => [name, await pushTable(name)] as const)
    );
    for (const [name, ok] of results) {
      if (!ok) {
        failed.add(name);
        dirtyTables.add(name);
      }
    }
  }
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
  if (failed.size > 0) persistPending();
  return failed;
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
    table.hook("deleting", (primKey) => {
      markDirty();
      if (!hydrating) markDeleted(table.name, primKey);
    });
  }
}

/**
 * Result of a pull attempt. "hydrated" means local data now reflects the
 * server. "empty" means the server was reached and genuinely has nothing
 * stored yet (no blob keys at all) — the one case where it's safe for a
 * caller to seed fresh data and publish it as the new shared baseline.
 * "failed" covers everything else that kept us from confirming the
 * server's state (offline, an unreachable/erroring endpoint, a table this
 * device couldn't push first) — callers must NOT treat "failed" the same
 * as "empty", since a device whose own local data also happens to be
 * empty (fresh browser storage, a new device, a reinstall) would otherwise
 * reseed demo data and push it as the new baseline, silently overwriting
 * every other device's real synced data with it. This exact bug caused a
 * shop's full product/inventory catalog and custom staff accounts to be
 * wiped and replaced with the default demo seed.
 */
export type PullResult = "hydrated" | "empty" | "failed";

/** Pulls every table's latest snapshot from the server and replaces local data with it. */
export async function pullAll(): Promise<PullResult> {
  // Always push before pulling — otherwise a pull could clear()+bulkAdd()
  // a table right out from under a write that's still queued (this
  // session's own debounce window, or one left over from a session that
  // reloaded/crashed before it fired), silently reverting it to the
  // server's stale copy. And if that push itself fails (flaky connection,
  // request rejected, timeout) — critically — this table must NOT be
  // pulled this round either: the server's snapshot is now known to be
  // missing this device's not-yet-synced write, so pulling it anyway would
  // silently erase that write (e.g. a completed sale) from local storage
  // too. It stays dirty and gets retried on the next poll instead.
  const failedLeftovers = await flushPersistedLeftovers();
  const failedNow = await flushNow();
  const failedPush = new Set([...failedLeftovers, ...failedNow]);
  try {
    const res = await fetch(`${SYNC_URL}?all=1`);
    if (!res.ok) return "failed";
    const remote = (await res.json()) as Record<string, RemoteEntry | null>;
    // A genuinely fresh server has no blob keys at all — this is the only
    // signal trustworthy enough to treat as "confirmed empty" rather than
    // "couldn't confirm". Once any key exists, a table simply not showing
    // up in `present` (filtered out below) is ambiguous — it could mean
    // this device's own push of it just failed — so that must never be
    // read as "empty" either.
    if (Object.keys(remote).length === 0) return "empty";
    const tableNames = new Set(db.tables.map((t) => t.name));
    const present = Object.keys(remote).filter(
      (k) =>
        tableNames.has(k) &&
        !LOCAL_ONLY_TABLES.has(k) &&
        Array.isArray(remote[k]?.data) &&
        !failedPush.has(k)
    );
    if (present.length === 0) return "failed";

    // One transaction per table, not one giant transaction spanning every
    // table — a single multi-table transaction holds a write lock on ALL of
    // them (including orders/ingredients) for as long as the whole loop
    // takes, which can stall an in-progress checkout (its own order +
    // inventory-deduction transaction just queues behind it) long enough to
    // look like a hang or a failure. Per-table transactions keep each lock
    // brief and scoped to just that table, and a failure on one table no
    // longer aborts ones that already committed.
    hydrating = true;
    try {
      for (const name of present) {
        const rows = remote[name]!.data as unknown[];
        await db.transaction("rw", db.table(name), async () => {
          await db.table(name).clear();
          if (rows.length > 0) await db.table(name).bulkAdd(rows);
        });
      }
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

    return "hydrated";
  } catch {
    return "failed";
  }
}

/**
 * Publishes every local table as the new shared baseline, replacing
 * whatever the server has — not merged. Used for the first device ever to
 * seed a fresh install, and for factory reset, where the whole point is
 * that this local state (just wiped and/or reseeded) becomes the entire
 * truth, discarding anything else the server was holding.
 */
export async function pushAll(): Promise<void> {
  await Promise.all(db.tables.map((t) => pushTableReplacing(t.name)));
}

/**
 * Pushes specific tables immediately, merged against the server's current
 * copy (see pushTable above). Needed after any write that bypasses the
 * creating/updating/deleting hooks and their debounce — most notably a
 * just-completed sale, which is only safe on this one device until it
 * reaches the server.
 */
export async function pushTables(names: string[]): Promise<void> {
  await Promise.all(names.map(pushTable));
}

/**
 * Pushes specific tables immediately, replacing the server's copy with no
 * merge. Only for a caller that just bulk-wiped those tables with
 * `table.clear()` (which fires no hooks, so nothing was tracked as a
 * pendingDelete) and genuinely means "this reduced local state is now the
 * whole truth" — e.g. "Reset Menu & Inventory". A merged push here would
 * fold the server's old rows right back in and undo the wipe.
 */
export async function pushTablesReplacing(names: string[]): Promise<void> {
  await Promise.all(names.map(pushTableReplacing));
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
