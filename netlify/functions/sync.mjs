import { getStore } from "@netlify/blobs";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Simple key-value proxy over Netlify Blobs, one key per Dexie table (each
// holding that table's full current array, or the settings singleton
// object). This mirrors the sync pattern already used in the sibling
// LAKBAI apps (inventory, pickleball booking) rather than a bespoke schema.
//
// Every key is stored wrapped as { rev, data } — a monotonic revision
// number plus the actual table array/object. This lets a client do an
// optimistic-concurrency push: "write this, but only if the revision I
// last read is still current" — so two devices pushing at nearly the same
// moment can no longer silently clobber each other; the second one gets a
// 409 with the now-current data and is expected to re-merge and retry (see
// pushTable in src/db/remoteSync.ts). Without this, a client-side merge
// alone still has a race window between its GET and its POST — normally
// tiny, but it stretches right back open on a slow/flaky connection, which
// is exactly the condition a small shop's wifi tends to produce.
//
// A key written before this revision system existed is a bare value (the
// array/object itself, no { rev, data } wrapper) — read as if it were
// { rev: 0, data: <that value> } so existing production data keeps working
// and simply gets wrapped in the envelope on its next write.
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

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  let store;
  try {
    store = getStore({ name: "lakbai-pos-data", consistency: "strong" });
  } catch {
    return new Response(JSON.stringify({ error: "Storage unavailable" }), {
      status: 503,
      headers: CORS,
    });
  }

  const url = new URL(req.url);

  try {
    if (req.method === "GET" && url.searchParams.get("all") === "1") {
      const { blobs } = await store.list();
      const entries = await Promise.all(
        blobs.map(async ({ key }) => {
          const raw = await store.get(key, { type: "json" });
          return [key, unwrapEntry(raw)];
        })
      );
      return new Response(JSON.stringify(Object.fromEntries(entries)), { headers: CORS });
    }

    if (req.method === "GET") {
      const key = url.searchParams.get("k");
      if (!key) {
        return new Response(JSON.stringify({ error: "k required" }), { status: 400, headers: CORS });
      }
      const raw = await store.get(key, { type: "json" });
      return new Response(JSON.stringify(unwrapEntry(raw)), { headers: CORS });
    }

    if (req.method === "POST") {
      const { key, value, expectedRev } = await req.json();
      if (!key) {
        return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers: CORS });
      }
      const current = unwrapEntry(await store.get(key, { type: "json" }));
      if (typeof expectedRev === "number" && expectedRev !== current.rev) {
        // Someone else wrote this key since the caller last read it — refuse
        // the blind overwrite and hand back the current state so the caller
        // can re-merge its local rows onto it and retry, instead of racing.
        return new Response(
          JSON.stringify({ conflict: true, rev: current.rev, data: current.data }),
          { status: 409, headers: CORS }
        );
      }
      const nextRev = current.rev + 1;
      await store.setJSON(key, { rev: nextRev, data: value });
      return new Response(JSON.stringify({ ok: true, rev: nextRev }), { headers: CORS });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
};

export const config = { path: "/.netlify/functions/sync" };
