import { getStore } from "@netlify/blobs";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const LIVE_STORE = "lakbai-pos-data";
const BACKUP_STORE = "lakbai-pos-backups";

function unwrapEntry(raw) {
  if (raw == null) return { rev: 0, data: null };
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof raw.rev === "number" &&
    Object.prototype.hasOwnProperty.call(raw, "data")
  ) {
    return { rev: raw.rev, data: raw.data };
  }
  return { rev: 0, data: raw };
}

// Lets the Settings → Backups admin screen list snapshots taken by the
// scheduled backup-snapshot.mjs function, and restore the live data store
// to one of them — the safety net for when the live store itself gets
// corrupted or wiped, since these snapshots live in a separate store that
// nothing in normal app operation ever writes to.
export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  let backups, live;
  try {
    backups = getStore({ name: BACKUP_STORE, consistency: "strong" });
    live = getStore({ name: LIVE_STORE, consistency: "strong" });
  } catch {
    return new Response(JSON.stringify({ error: "Storage unavailable" }), {
      status: 503,
      headers: CORS,
    });
  }

  try {
    if (req.method === "GET") {
      const { blobs } = await backups.list();
      const snapshots = await Promise.all(
        blobs.map(async ({ key }) => {
          const snap = await backups.get(key, { type: "json" });
          const tableCounts = {};
          if (snap?.tables) {
            for (const [name, data] of Object.entries(snap.tables)) {
              tableCounts[name] = Array.isArray(data) ? data.length : data ? 1 : 0;
            }
          }
          return { key, createdAt: snap?.createdAt ?? null, tableCounts };
        })
      );
      snapshots.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      return new Response(JSON.stringify({ snapshots }), { headers: CORS });
    }

    if (req.method === "POST") {
      const { action, key } = await req.json();
      if (action !== "restore" || !key) {
        return new Response(JSON.stringify({ error: "action 'restore' and key required" }), {
          status: 400,
          headers: CORS,
        });
      }

      const snap = await backups.get(key, { type: "json" });
      if (!snap?.tables) {
        return new Response(JSON.stringify({ error: "Snapshot not found" }), {
          status: 404,
          headers: CORS,
        });
      }

      // Write every table from the snapshot back into the live store as the
      // new current state — a deliberate, admin-confirmed full replace, the
      // same semantics as any other restore. Each table's revision is
      // bumped from whatever the live store currently has so every
      // already-open client's next pull/push sees this as newer, not
      // conflicting, state.
      const restoredTables = [];
      for (const [name, data] of Object.entries(snap.tables)) {
        const current = unwrapEntry(await live.get(name, { type: "json" }));
        await live.setJSON(name, { rev: current.rev + 1, data });
        restoredTables.push(name);
      }

      return new Response(JSON.stringify({ ok: true, restoredTables }), { headers: CORS });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
};

export const config = { path: "/.netlify/functions/backups" };
