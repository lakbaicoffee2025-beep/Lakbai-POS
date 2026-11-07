import { db } from "./db";
import { newId } from "../lib/id";
import type { ImportPlan } from "../lib/menuImport";
import type { Category, Ingredient, Product, ModifierGroup } from "../types";

export interface ApplyImportResult {
  categoriesCreated: number;
  ingredientsCreated: number;
  ingredientsUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  modifierGroupsCreated: number;
}

/**
 * Writes an ImportPlan to Dexie, upserting by `sku` (products/ingredients)
 * or by name (categories/modifier groups) so re-importing an updated export
 * refreshes menu structure without duplicating records or clobbering data
 * the import can't know about: existing stock counts and any modifier
 * pricing the admin already corrected are preserved on update, not reset.
 */
export async function applyMenuImport(plan: ImportPlan): Promise<ApplyImportResult> {
  const result: ApplyImportResult = {
    categoriesCreated: 0,
    ingredientsCreated: 0,
    ingredientsUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    modifierGroupsCreated: 0,
  };

  await db.transaction(
    "rw",
    [db.categories, db.ingredients, db.products, db.modifierGroups],
    async () => {
      // ---- Categories: match by name (case-insensitive) ----
      const existingCategories = await db.categories.toArray();
      const categoryIdByName = new Map(
        existingCategories.map((c) => [c.name.toLowerCase(), c.id])
      );
      let nextSort = existingCategories.length;
      for (const cat of plan.categories) {
        const key = cat.name.toLowerCase();
        if (!categoryIdByName.has(key)) {
          const record: Category = { id: newId(), name: cat.name, sortOrder: nextSort++ };
          await db.categories.add(record);
          categoryIdByName.set(key, record.id);
          result.categoriesCreated++;
        }
      }

      // ---- Ingredients: match by sku ----
      const existingIngredients = await db.ingredients.toArray();
      const ingredientIdBySku = new Map(
        existingIngredients.filter((i) => i.sku).map((i) => [i.sku as string, i])
      );
      const skuToIngredientId = new Map<string, string>();
      for (const ing of plan.ingredients) {
        const existing = ingredientIdBySku.get(ing.sku);
        if (existing) {
          await db.ingredients.update(existing.id, {
            name: ing.name,
            unit: ing.unit,
            costPerUnit: ing.costPerUnit,
            reorderLevel: ing.reorderLevel,
            updatedAt: Date.now(),
            // stockQty intentionally left untouched — real counts live in-app.
          });
          skuToIngredientId.set(ing.sku, existing.id);
          result.ingredientsUpdated++;
        } else {
          const record: Ingredient = {
            id: newId(),
            name: ing.name,
            unit: ing.unit,
            stockQty: ing.stockQty,
            reorderLevel: ing.reorderLevel,
            costPerUnit: ing.costPerUnit,
            sku: ing.sku,
            updatedAt: Date.now(),
          };
          await db.ingredients.add(record);
          skuToIngredientId.set(ing.sku, record.id);
          result.ingredientsCreated++;
        }
      }

      const resolveRecipe = (refs: { ingredientSku: string; qty: number }[]) =>
        refs
          .map((r) => {
            const ingredientId = skuToIngredientId.get(r.ingredientSku);
            return ingredientId ? { ingredientId, qty: r.qty } : null;
          })
          .filter((r): r is { ingredientId: string; qty: number } => r !== null);

      // ---- Modifier groups: match by name, never overwrite existing options ----
      const existingGroups = await db.modifierGroups.toArray();
      const groupIdByName = new Map(existingGroups.map((g) => [g.name.toLowerCase(), g.id]));
      for (const mg of plan.modifierGroups) {
        const key = mg.name.toLowerCase();
        if (!groupIdByName.has(key)) {
          const record: ModifierGroup = {
            id: newId(),
            name: mg.name,
            min: 0,
            max: 1,
            required: false,
            options: mg.options.map((o) => ({
              id: newId(),
              name: o.name,
              priceDelta: o.priceDelta,
              recipe: [],
            })),
          };
          await db.modifierGroups.add(record);
          groupIdByName.set(key, record.id);
          result.modifierGroupsCreated++;
        }
      }

      // ---- Products: match by sku ----
      const existingProducts = await db.products.toArray();
      const productBySku = new Map(
        existingProducts.filter((p) => p.sku).map((p) => [p.sku as string, p])
      );
      let productSort = existingProducts.length;
      for (const p of plan.products) {
        const categoryId = categoryIdByName.get(p.categoryName.toLowerCase());
        if (!categoryId) continue; // shouldn't happen — category list is derived from the same products

        const recipe = resolveRecipe(p.recipe);
        const variants = p.variants.map((v) => ({
          id: newId(),
          name: v.name,
          priceDelta: v.priceDelta,
          recipe: resolveRecipe(v.recipe),
        }));
        const modifierGroupIds = p.modifierGroupNames
          .map((name) => groupIdByName.get(name.toLowerCase()))
          .filter((id): id is string => !!id);

        const existing = p.sku ? productBySku.get(p.sku) : undefined;
        if (existing) {
          await db.products.update(existing.id, {
            name: p.name,
            categoryId,
            basePrice: p.basePrice,
            active: p.active,
            recipe,
            variants,
            modifierGroupIds,
          });
          result.productsUpdated++;
        } else {
          const record: Product = {
            id: newId(),
            name: p.name,
            categoryId,
            basePrice: p.basePrice,
            active: p.active,
            recipe,
            variants,
            modifierGroupIds,
            sortOrder: productSort++,
            sku: p.sku || undefined,
          };
          await db.products.add(record);
          result.productsCreated++;
        }
      }
    }
  );

  return result;
}
