import { db } from "./db";
import { seedIfEmpty } from "./seed";
import { pushAll, pushTables } from "./remoteSync";

const MENU_TABLES = [
  "categories",
  "products",
  "modifierGroups",
  "discounts",
  "ingredients",
  "suppliers",
  "purchaseOrders",
  "inventoryMovements",
  "inventoryCounts",
];

/**
 * Wipes the product/inventory catalog — categories, products, modifier
 * groups, discounts, ingredients, suppliers, purchase orders, inventory
 * movements/counts — so the store can rebuild or re-import a menu from
 * scratch. Sales history (orders/shifts/expenses), users, and store
 * settings are left untouched.
 */
export async function resetMenuAndInventory(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.categories,
      db.products,
      db.modifierGroups,
      db.discounts,
      db.ingredients,
      db.suppliers,
      db.purchaseOrders,
      db.inventoryMovements,
      db.inventoryCounts,
    ],
    async () => {
      await db.categories.clear();
      await db.products.clear();
      await db.modifierGroups.clear();
      await db.discounts.clear();
      await db.ingredients.clear();
      await db.suppliers.clear();
      await db.purchaseOrders.clear();
      await db.inventoryMovements.clear();
      await db.inventoryCounts.clear();
    }
  );
  // Dexie's clear() doesn't fire the hooks that normally queue a sync push,
  // so push the wipe explicitly — otherwise the next poll would pull the
  // old data back from the server.
  await pushTables(MENU_TABLES);
}

/**
 * Wipes every table — including sales history, users, and settings — and
 * reseeds the default demo accounts/store config, i.e. back to a fresh
 * install. Callers must log the current session out afterward, since the
 * signed-in user record no longer exists.
 */
export async function factoryReset(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
  await seedIfEmpty();
  // Same reasoning as above: clear() bypasses the sync hooks, so publish
  // the wiped-and-reseeded state as the new shared baseline explicitly.
  await pushAll();
}
