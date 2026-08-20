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
          const val = await store.get(key, { type: "json" });
          return [key, val ?? null];
        })
      );
      return new Response(JSON.stringify(Object.fromEntries(entries)), { headers: CORS });
    }

    if (req.method === "GET") {
      const key = url.searchParams.get("k");
      if (!key) {
        return new Response(JSON.stringify({ error: "k required" }), { status: 400, headers: CORS });
      }
      const val = await store.get(key, { type: "json" });
      return new Response(JSON.stringify(val ?? null), { headers: CORS });
    }

    if (req.method === "POST") {
      const { key, value } = await req.json();
      if (!key) {
        return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers: CORS });
      }
      await store.setJSON(key, value);
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
};

export const config = { path: "/.netlify/functions/sync" };
