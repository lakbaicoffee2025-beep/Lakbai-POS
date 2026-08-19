# LAKBAI Coffee POS

A mobile-first Point of Sale and inventory management system for LAKBAI Coffee, built with React, TypeScript, and Tailwind CSS. Optimized for phones and tablets, with a landscape-tuned POS screen for use as a handheld register.

## Features

- **POS** — category-filtered product grid, size variants, modifiers (milk options, add-ons, sweetness, etc.), per-line and order-level discounts, Cash / GCash / split payment, printable receipt.
- **Ingredient-based inventory** — every product/variant/modifier has a recipe of ingredients; each sale automatically deducts stock and logs a movement.
- **Purchase orders** — draft → ordered → received workflow per supplier, restocks ingredients automatically on receipt (supports partial receiving).
- **Shift management** — open a shift with a starting cash float, sell throughout the shift, then close with a Cash + GCash count and automatic variance calculation against expected takings.
- **Expenses** — log daily out-of-pocket store purchases (supplies, utilities, etc.) by category and payment method; expenses reduce the expected cash-in-drawer total for the shift they're logged against.
- **Reports** — daily sales & top products, full shift history, expense breakdown by category/date range, inventory valuation & low-stock alerts.
- **Roles** — Admin (full access), Cashier (POS + own shifts + expenses), Stockman (inventory, purchase orders, suppliers + expenses). Enforced via protected routes.
- **Settings** — store name/address, currency, tax rate (inclusive/exclusive), receipt footer, low-stock default threshold.

## Data storage

This app is **local-first**: all data lives in the browser's IndexedDB (via Dexie.js) on the device it's used on — there is no backend server or external database. This means:

- It works fully offline once loaded, which is ideal for a register that can't depend on Wi-Fi.
- Data does **not** sync between devices/browsers. If you run the POS on a phone and a tablet, they'll have separate, independent data.
- Clearing browser data/site data on that device will erase the store's data, so avoid clearing site data and consider periodically checking your browser doesn't auto-clear storage.

For a single-till cafe counter this is usually fine. If you later need multiple registers sharing one live inventory/sales feed, that would require adding a real backend (e.g. Supabase/Postgres) — the code is organized (`src/db`) so that swap is contained to one layer.

## Demo accounts

Seeded automatically on first load:

| Role     | Username   | PIN  |
|----------|-----------|------|
| Admin    | `admin`    | 1234 |
| Cashier  | `cashier`  | 1111 |
| Stockman | `stockman` | 2222 |

Change these PINs from **Users** (admin only) before real use.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

## Deploying to Netlify

This repo includes `netlify.toml` (build command `npm run build`, publish dir `dist`, SPA redirect to `index.html`).

**Option A — Netlify UI:** New site from Git → pick this repo → build settings are auto-detected from `netlify.toml` → Deploy.

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify deploy --build --prod
```

No environment variables or external services are required — it's a static bundle.
