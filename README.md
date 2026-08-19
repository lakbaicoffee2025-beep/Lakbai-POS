# LAKBAI Coffee POS

A mobile-first Point of Sale and inventory management system for LAKBAI Coffee, built with React, TypeScript, and Tailwind CSS. Optimized for phones and tablets, with a landscape-tuned POS screen for use as a handheld register.

## Features

- **POS** — category-filtered product grid, size variants, modifiers (milk options, add-ons, sweetness, etc.), per-line and order-level discounts, Cash / GCash / split payment, printable receipt.
- **Ingredient-based inventory** — every product/variant/modifier has a recipe of ingredients; each sale automatically deducts stock and logs a movement.
- **Purchase orders** — draft → ordered → received workflow per supplier, restocks ingredients automatically on receipt (supports partial receiving).
- **Shift management** — open a shift with a starting cash float, sell throughout the shift, then close with a Cash + GCash count and automatic variance calculation against expected takings. Optional **blind cash count**: admins can hide running sales totals and the expected-amount hint from cashiers, who then just record their physical count — admins still see full totals and variances in Reports.
- **Daily inventory count** (Inventory → Daily Count) — every ingredient listed at once, pre-filled with current stock, for fast beginning/ending-of-day counts. Submitting reconciles stock to what was counted and logs the variance as a normal adjustment.
- **Expenses** — log daily out-of-pocket store purchases (supplies, utilities, etc.) by category and payment method; expenses reduce the expected cash-in-drawer total for the shift they're logged against.
- **Reports** — daily sales & top products, full shift history, expense breakdown by category/date range, inventory valuation & low-stock alerts.
- **Roles** — Admin (full access), Cashier (POS + own shifts + expenses), Stockman (inventory, purchase orders, suppliers + expenses). Enforced via protected routes.
- **Settings** — store name/address, currency, tax rate (inclusive/exclusive), receipt footer, low-stock default threshold, confidentiality, and a Danger Zone to reset the menu/inventory or factory-reset everything.
- **CSV menu import** (Settings → Import Menu) — upload a Loyverse-style `export_items.csv` from a previous POS to bring in categories, products, size variants, and ingredient recipes in one go. Re-uploading an updated file later updates existing items by SKU instead of duplicating them, and never overwrites stock counts or modifier pricing you've already corrected in-app. See [CSV import notes](#csv-import-notes) below for what it does and doesn't infer.

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

## CSV import notes

The importer (`src/lib/menuImport.ts`) is built for the Loyverse "export items" CSV format, where a single item can span multiple rows. What it does automatically:

- Rows whose Category is exactly `Ingredients` become raw-material Ingredients, not sellable products.
- A product's `SKU of included item` / `Quantity of included item` columns are resolved into its recipe against those ingredients — this is what makes automatic stock deduction work after import.
- Multi-row items (Option value repeated across rows, e.g. Hot/Iced) become product size/flavor **variants**, priced relative to the first row.
- Items that had `Track stock = Y` in the old system but no recipe reference (e.g. teas sold without a defined BOM) get a dedicated 1:1 "self-stock" ingredient synthesized for them, so their historical stock count (including negative counts from past overselling) carries over and future sales keep deducting it.
- Per-item modifier flag columns (`Modifier - "X"`) become modifier groups with a placeholder ₱0 option, since the export doesn't carry modifier pricing.

What it deliberately does **not** guess, and flags as a warning instead:

- **Starting ingredient stock** for real raw materials — the export has no stock count for those, so they import at 0. Do an initial count and use Inventory → Adjust Stock (or a Purchase Order) to set real quantities before relying on low-stock alerts.
- **Modifier prices** — review and set these in Products → Modifiers.
- **Open/"variable" priced items** — imported at ₱0; set a real price in Products.
- **A recipe referencing another sellable product rather than a raw ingredient** (some old menus modeled one dish as "1x another dish") — our recipe model only supports ingredient components, so these import as a placeholder ingredient that never restocks; rebuild that recipe by hand if it comes up.
- **Duplicate product names under different SKUs** (old test/duplicate entries) — both import; hide or delete the stale one from Products.

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
