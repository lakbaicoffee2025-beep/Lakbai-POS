# LAKBAI Coffee POS

A mobile-first Point of Sale and inventory management system for LAKBAI Coffee, built with React, TypeScript, and Tailwind CSS. Optimized for phones and tablets, with a landscape-tuned POS screen for use as a handheld register.

## Features

- **Dashboard** (Admin only, first item in the nav and the page Admin lands on after login) — a live, auto-updating view of sales: order count, net sales, cash/GCash split, and the top 5 best-selling products, for a selectable Today / 1 Week / 1 Month / custom date-range window. Also includes a separate product sales lookup with its own 1 Week / 1 Month / custom date-range filter to see how many units of a specific product sold in that window. **Shift Sales Breakdown**: pick any shift (open or closed, any cashier) to see exactly what sold during it — quantity sold per product with a By Category filter showing totals per category, and an hourly sales bar chart across the shift's duration (each hour of the shift gets a bar, 0 if nothing sold that hour).
- **POS** — category-filtered product grid, size variants, modifiers (milk options, add-ons, sweetness, etc.), per-line and order-level discounts, Cash / GCash / split payment, an optional customer name, and a printable receipt. A grid/list view toggle lets a cashier switch the product picker between the visual card grid and a denser list layout — the choice is remembered per device. Selecting a size/modifier is never required, and a sale can go through even for an item flagged out of stock. **Open Tickets**: hold a cart before payment under a name/notes (e.g. a table or customer) and resume it later — handy for a customer who steps away or a phoned-in order. The cart currently being built is also auto-saved per shift in the background, so an accidental page reload or crash mid-sale doesn't lose it — it's restored automatically the next time that shift is open on that device. Discounts can be turned off store-wide from Settings (Admin only) — when off, cashiers see no discount picker at checkout at all; the discount list itself (Products → Discounts) is always admin-only to create, edit, or enable/disable.
- **Receipts** (every completed sale) — a searchable transaction history (by customer name, cashier, or order #) so any past receipt can be pulled up again. Cashiers only see receipts from their currently open shift — once it's closed, that history is admin-only; Admin sees every transaction across every shift and date, with a date filter, and can **void** a transaction — restoring exactly the ingredient stock it deducted and requiring a reason — a capability cashiers never see or have access to, or permanently **delete** a receipt outright when it needs to be removed from history entirely rather than just flagged — delete does not touch ingredient stock (only Void and Refund do), so void it first if the stock also needs to come back. **Refunds**: Cashier or Admin can refund some or all of the quantity on any line of any receipt, with a required reason — it replenishes exactly the ingredients that quantity deducted and is tracked separately from the original sale (the order stays on record; a refunded line shows "X of Y refunded", and the order flips to Fully Refunded once every line is). Refunded amounts are netted out of the Dashboard, Sales Report, and shift cash-in-drawer figures automatically.
- **Cross-device sync** — when deployed to Netlify, every device/browser signed into the same store sees the same menu, inventory, receipts, shifts, and settings, kept in sync automatically in the background. See [Data storage](#data-storage) below.
- **Ingredient-based inventory** — every product/variant/modifier has a recipe of ingredients; each sale automatically deducts stock and logs a movement. Stock tracking can be turned off per product (Products → Edit → Track Stock) for items you don't want inventory-tracked.
- **Product management** (Products, Admin only) — create/edit/hide/delete products, with a category filter to narrow the list down to one category at a time. A multi-select mode lets Admin bulk-move several products to a different category, bulk show/hide them, or bulk-delete them in one action.
- **Stock Dashboard** (Inventory → Dashboard, the default tab) — at-a-glance stat cards (total ingredients, OK/Low/Critical counts, inventory valuation) plus a searchable, color-coded grid of every ingredient's status. Available to both Admin and Stockman.
- **Ingredient management** (Inventory → Ingredients) — create, edit, and adjust stock for every ingredient. Admin can also delete an ingredient (warns first if it's still used in a product/modifier recipe), and switch into a multi-select mode to bulk-delete, bulk-set the reorder level, or bulk-assign a supplier across several ingredients at once.
- **Restock** (Inventory → Restock) — a fast bulk stock-in screen for supply runs that don't go through a formal purchase order: every ingredient listed with a blank quantity field, fill in only what you're restocking, submit once. Logs a movement per ingredient and keeps its own recent-restocks history. Auto-saves as a draft in the background, so an accidental exit before submitting doesn't lose what was entered.
- **Purchase orders** — draft → ordered → received workflow per supplier, restocks ingredients automatically on receipt (supports partial receiving). The in-progress order (supplier + line items) is auto-saved while the New Purchase Order form is open, so an accidental close doesn't lose it.
- **Shift management** — open a shift with a starting cash float, sell throughout the shift, then close with a Cash + GCash count and automatic variance calculation against expected takings. **Paid Out**: record cash taken out of the drawer mid-shift (description + amount) — e.g. a quick supply run paid straight from the till — which reduces the expected cash-in-drawer the same way any other cash expense does. Optional **blind cash count**: admins can hide running sales totals and the expected-amount hint from cashiers, who then just record their physical count — admins still see full totals and variances in Reports. Admin doesn't open/sell shifts themselves (no POS access) — instead, Reports → Shifts lists every cashier's shifts (open and closed) in one place, and Admin can edit a shift's starting cash / counted amounts / notes (expected cash and variance recalculate automatically) or delete a shift record entirely.
- **Inventory count** (Inventory → Inventory Count) — every ingredient listed at once, pre-filled with current stock, for fast beginning/ending-of-day counts (Admin and Stockman). Admin also has a third option, **Actual Count**, for a physical stock-take that can be run any time rather than tied to day open/close and is treated as the final, authoritative figure for every ingredient submitted. Submitting any count type reconciles stock to what was counted; a mismatch between the count and system stock is logged to the Movement Log flagged as a Discrepancy (Beginning/Ending) or Final (Actual Count), carrying forward whatever notes were entered on the count. The count in progress auto-saves as a draft in the background, so an accidental exit before submitting doesn't lose it.
- **Movement Log** (Inventory → Movement Log, Admin only) — every stock change (sales, purchase receipts, adjustments, waste, count reconciliations) with a custom From/To date range filter and a CSV export of the filtered results.
- **Spoilage log** (Inventory → Spoilage) — log damaged/expired stock with a reason and an optional photo; deducts stock immediately and keeps a searchable history. Auto-saves as a draft in the background (including the attached photo), so an accidental exit before submitting doesn't lose it.
- **Expenses** — cash-envelope reports: record cash/ATM received, itemized spending (description + amount) with receipt photos, and the remaining-cash return status, with a one-tap carryover of yesterday's unreturned balance. Each line item is also mirrored into the plain expense log so it reduces the expected cash-in-drawer total for the shift it's logged against and still shows up in Reports. The report form auto-saves as a draft in the background (including photos), so an accidental exit or lost connection before hitting Save doesn't lose it. Staff can edit or delete a report they submitted for 24 hours after submitting it; after that (or for a report submitted by someone else) it shows as Locked. Admin can edit or delete any report at any time, with no age limit, and has an additional **Storage Cleanup** tool to clear receipt photos older than a chosen age (30/60/90 days, or a custom number of days) to free up local storage — amounts and descriptions are kept, only the images are removed.
- **Reports** — daily sales & top products, full shift history, expense breakdown by category/date range, inventory valuation & low-stock alerts.
- **Search** — Products and Inventory → Ingredients both have a search bar filtering the list by name, on top of the Dashboard and Restock tabs' own ingredient search.
- **Roles** — Admin (dashboard, reports, users, settings, products, inventory oversight incl. Movement Log, receipts/refunds — no POS/register access), Cashier (POS + own shifts, incl. Paid Out + refunds — no Expenses), Stockman (inventory, purchase orders, suppliers + expenses — no Movement Log). Enforced via protected routes.
- **Settings** — store name/address, currency, tax rate (inclusive/exclusive), receipt footer, low-stock default threshold, confidentiality, and a Danger Zone to reset the menu/inventory or factory-reset everything.
- **CSV menu import** (Settings → Import Menu) — upload a Loyverse-style `export_items.csv` from a previous POS to bring in categories, products, size variants, and ingredient recipes in one go. Re-uploading an updated file later updates existing items by SKU instead of duplicating them, and never overwrites stock counts or modifier pricing you've already corrected in-app. See [CSV import notes](#csv-import-notes) below for what it does and doesn't infer.

## Data storage

This app is **local-first with cross-device sync**: every read and write goes through the browser's IndexedDB (via Dexie.js) on the device it's used on, exactly as before — nothing about how the app is used changes. On top of that, when deployed to Netlify, a small serverless function (`netlify/functions/sync.mjs`) backed by **Netlify Blobs** mirrors the data so every device/browser signed into the same deployed site converges on the same menu, inventory, receipts, shifts, and settings:

- **Push** — any local write (create/update/delete) debounces briefly, then pushes just the affected table up as its full current snapshot.
- **Pull** — on load, the app first tries to hydrate from the server (so a second device gets real data instead of re-seeding its own demo set); after that it polls every ~8 seconds for changes made elsewhere.
- **Conflict model** — simple last-write-wins per table, no merge/CRDT logic. Fine for a small shop's counter(s); if two devices edit the exact same record within the same poll window, whichever push lands last on the server wins.
- **Fully offline-capable** — every sync call fails silently. Without a deployed Netlify Function (plain `vite dev`/`vite preview`, a non-Netlify static host, or just no network), the app keeps working exactly as it always has: purely on the local IndexedDB copy, with no sync.
- Clearing browser data/site data on a device will erase that device's local copy, but it will re-hydrate from the server (if reachable) on next load instead of re-seeding demo data — as long as at least one other synced device/deploy has pushed real data before.

No environment variables or account setup are required for sync to work — Netlify Blobs auto-provisions per site once deployed.

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

Plain `npm run dev` (Vite only) runs the app fully local-only — there's no server for `/api/sync` to hit, so every device has independent data, same as before sync existed. To exercise cross-device sync locally, run it through the Netlify CLI instead (`npx netlify dev`), which serves `netlify/functions/sync.mjs` alongside the app.

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

No environment variables, account setup, or external services are required — Netlify provisions the Blobs store and the sync function automatically as part of the deploy.
