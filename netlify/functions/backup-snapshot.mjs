import { getStore } from "@netlify/blobs";

// Scheduled function: every few hours, copies the entire live data store
// into a separate, append-only backups store under a timestamped key. This
// is the safety net for the class of bug that already wiped this shop's
// data twice — an admin can restore any one of these snapshots from
// Settings regardless of what caused the live store to go wrong, without
// needing this function, a redeploy, or anyone's help.
//
// Deliberately a *separate* Netlify Blobs store ("lakbai-pos-backups"),
// never the live one ("lakbai-pos-data") — a snapshot must survive even a
// bug that empties or corrupts the live store, so it can never be written
// back into, only ever appended to and read from here.

const SOURCE_STORE = "lakbai-pos-data";
const BACKUP_STORE = "lakbai-pos-backups";
const RETENTION_DAYS = 14;

function snapshotKey(date) {
  // Sortable, filesystem/URL-safe: 2026-10-06T09-00-00Z
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function keyToDate(key) {
  const iso = key.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})Z$/,
    "$1:$2:$3Z"
  );
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async () => {
  let source, backups;
  try {
    source = getStore({ name: SOURCE_STORE, consistency: "strong" });
    backups = getStore({ name: BACKUP_STORE, consistency: "strong" });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 503 });
  }

  try {
    const { blobs } = await source.list();
    // Nothing to snapshot yet (fresh install) — don't write an empty
    // snapshot that would just be noise in the restore list.
    if (blobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "source empty" }));
    }

    const tables = {};
    for (const { key } of blobs) {
      const raw = await source.get(key, { type: "json" });
      // Unwrap the {rev, data} envelope the same way sync.mjs does — a
      // restore only ever needs the data, a fresh rev gets assigned when
      // it's written back.
      const data =
        raw && typeof raw === "object" && !Array.isArray(raw) && "data" in raw
          ? raw.data
          : raw;
      tables[key] = data;
    }

    const now = new Date();
    const key = snapshotKey(now);
    await backups.setJSON(key, { createdAt: now.getTime(), tables });

    // Prune anything past the retention window so storage doesn't grow
    // forever. A failure here shouldn't fail the snapshot that was just
    // taken — it just means pruning catches up next run.
    try {
      const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const { blobs: existing } = await backups.list();
      await Promise.all(
        existing.map(async ({ key: k }) => {
          const d = keyToDate(k);
          if (d && d.getTime() < cutoff) await backups.delete(k);
        })
      );
    } catch {
      // ignore — next scheduled run retries pruning
    }

    return new Response(JSON.stringify({ ok: true, key }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

// Every 2 hours — frequent enough that "restore to a time earlier today"
// is meaningful, bounded enough (12/day × 14 days retained) to keep
// storage modest for a small shop's data volume.
export const config = { schedule: "0 */2 * * *" };
