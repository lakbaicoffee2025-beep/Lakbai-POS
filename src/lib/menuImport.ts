import type { IngredientUnit } from "../types";

/**
 * Transforms a Loyverse-style "export_items.csv" into a store-agnostic
 * import plan. This format encodes a lot in row structure rather than
 * columns, so the parsing rules below exist to decode:
 *
 * - A row with a non-empty "Name" starts a new item. Rows that follow it
 *   with a blank Name belong to that item, and are one of:
 *     - a "recipe continuation" row: blank Name, but "SKU of included
 *       item" is set — another ingredient consumed by the most recently
 *       defined unit (the item itself, or its most recent variant).
 *     - a "variant continuation" row: blank Name, but an Option value is
 *       set (and no included-item SKU) — another priced variant of the
 *       same item (e.g. Hot/Iced), with its own SKU/cost/price/stock.
 * - Items in the "Ingredients" category are raw stock, not sellable
 *   products; other items reference them via "SKU of included item" to
 *   build a recipe/BOM that drives automatic stock deduction on sale.
 * - Items with "Track stock" = Y but no BOM reference were tracked as a
 *   single stocked unit in the old system (no separate ingredient
 *   entity). We preserve that by synthesizing a 1:1 "self-stock"
 *   ingredient so per-item stock tracking still works after import.
 */

export interface ImportRecipeRef {
  ingredientSku: string;
  qty: number;
}

export interface ImportIngredient {
  sku: string;
  name: string;
  unit: IngredientUnit;
  costPerUnit: number;
  stockQty: number;
  reorderLevel: number;
  synthesized?: boolean; // true for self-stock ingredients we invented, not from an Ingredients row
}

export interface ImportModifierGroup {
  name: string;
  options: { name: string; priceDelta: number }[];
}

export interface ImportVariant {
  sku: string;
  name: string;
  priceDelta: number;
  recipe: ImportRecipeRef[];
}

export interface ImportProduct {
  sku: string;
  name: string;
  categoryName: string;
  active: boolean;
  basePrice: number;
  recipe: ImportRecipeRef[];
  variants: ImportVariant[];
  modifierGroupNames: string[];
}

export interface ImportCategory {
  name: string;
}

export interface ImportPlan {
  categories: ImportCategory[];
  ingredients: ImportIngredient[];
  modifierGroups: ImportModifierGroup[];
  products: ImportProduct[];
  warnings: string[];
}

interface ColumnMap {
  handle: number;
  sku: number;
  name: number;
  category: number;
  soldByWeight: number;
  opt1val: number;
  opt2val: number;
  opt3val: number;
  cost: number;
  includedSku: number;
  includedQty: number;
  trackStock: number;
  available: number;
  price: number;
  inStock: number;
  lowStock: number;
}

interface RawUnit {
  sku: string;
  name: string;
  price: number;
  priceIsVariable: boolean;
  cost: number;
  trackStock: boolean;
  inStock: number | null;
  lowStock: number | null;
  recipe: ImportRecipeRef[];
}

interface RawItem {
  name: string;
  category: string;
  available: boolean;
  soldByWeight: boolean;
  modifierFlags: string[];
  units: RawUnit[];
  primaryOptVal: string;
}

function findCol(headers: string[], label: string, prefixOnly = false): number {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(label);
  return headers.findIndex((h) =>
    prefixOnly ? norm(h).startsWith(target) : norm(h) === target
  );
}

function cell(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function isYes(s: string): boolean {
  return s.trim().toUpperCase() === "Y";
}

function buildColumnMap(headers: string[]): ColumnMap {
  return {
    handle: findCol(headers, "Handle"),
    sku: findCol(headers, "SKU"),
    name: findCol(headers, "Name"),
    category: findCol(headers, "Category"),
    soldByWeight: findCol(headers, "Sold by weight"),
    opt1val: findCol(headers, "Option 1 value"),
    opt2val: findCol(headers, "Option 2 value"),
    opt3val: findCol(headers, "Option 3 value"),
    cost: findCol(headers, "Cost"),
    includedSku: findCol(headers, "SKU of included item"),
    includedQty: findCol(headers, "Quantity of included item"),
    trackStock: findCol(headers, "Track stock"),
    available: findCol(headers, "Available for sale", true),
    price: findCol(headers, "Price", true),
    inStock: findCol(headers, "In stock", true),
    lowStock: findCol(headers, "Low stock", true),
  };
}

function findModifierCols(headers: string[]): { index: number; name: string }[] {
  const cols: { index: number; name: string }[] = [];
  headers.forEach((h, i) => {
    const m = h.trim().match(/^Modifier\s*-\s*"(.+)"$/i);
    if (m) cols.push({ index: i, name: m[1] });
  });
  return cols;
}

function parseGroups(
  dataRows: string[][],
  col: ColumnMap,
  modifierCols: { index: number; name: string }[]
): RawItem[] {
  const items: RawItem[] = [];
  let current: RawItem | null = null;

  for (const row of dataRows) {
    const nameVal = cell(row, col.name);

    if (nameVal) {
      const priceRaw = cell(row, col.price);
      const priceIsVariable = priceRaw.toLowerCase() === "variable";
      const unit: RawUnit = {
        sku: cell(row, col.sku),
        name: nameVal,
        price: priceIsVariable ? 0 : num(priceRaw),
        priceIsVariable,
        cost: num(cell(row, col.cost)),
        trackStock: isYes(cell(row, col.trackStock)),
        inStock: cell(row, col.inStock) ? num(cell(row, col.inStock)) : null,
        lowStock: cell(row, col.lowStock) ? num(cell(row, col.lowStock)) : null,
        recipe: [],
      };
      const includedSku = cell(row, col.includedSku);
      if (includedSku) {
        unit.recipe.push({ ingredientSku: includedSku, qty: num(cell(row, col.includedQty)) });
      }

      current = {
        name: nameVal,
        category: cell(row, col.category) || "Uncategorized",
        available: isYes(cell(row, col.available)),
        soldByWeight: isYes(cell(row, col.soldByWeight)),
        modifierFlags: modifierCols
          .filter((m) => isYes(cell(row, m.index)))
          .map((m) => m.name),
        units: [unit],
        primaryOptVal: cell(row, col.opt1val) || cell(row, col.opt2val) || cell(row, col.opt3val),
      };
      items.push(current);
      continue;
    }

    if (!current) continue; // stray row before any item was defined

    const includedSku = cell(row, col.includedSku);
    const optVal = cell(row, col.opt1val) || cell(row, col.opt2val) || cell(row, col.opt3val);

    if (includedSku) {
      current.units[current.units.length - 1].recipe.push({
        ingredientSku: includedSku,
        qty: num(cell(row, col.includedQty)),
      });
    } else if (optVal) {
      const priceRaw = cell(row, col.price);
      const priceIsVariable = priceRaw.toLowerCase() === "variable";
      current.units.push({
        sku: cell(row, col.sku),
        name: optVal,
        price: priceIsVariable ? 0 : num(priceRaw),
        priceIsVariable,
        cost: num(cell(row, col.cost)),
        trackStock: isYes(cell(row, col.trackStock)),
        inStock: cell(row, col.inStock) ? num(cell(row, col.inStock)) : null,
        lowStock: cell(row, col.lowStock) ? num(cell(row, col.lowStock)) : null,
        recipe: [],
      });
    }
    // else: blank/unrecognized continuation row — ignore
  }

  // A multi-unit item's first unit was labeled with the product name; relabel
  // it to the option value that was on the primary row (e.g. "Hot").
  for (const item of items) {
    if (item.units.length > 1) {
      item.units[0].name = item.primaryOptVal || "Default";
    }
  }

  return items;
}

export function transformMenuCsv(rows: string[][]): ImportPlan {
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { categories: [], ingredients: [], modifierGroups: [], products: [], warnings: ["File has no data rows."] };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const col = buildColumnMap(headers);

  if (col.name === -1 || col.price === -1) {
    warnings.push(
      'Could not find a "Name" and/or "Price" column in this file — it may not be a supported export format.'
    );
  }

  const modifierCols = findModifierCols(headers);
  const rawItems = parseGroups(dataRows, col, modifierCols);

  const ingredientItems = rawItems.filter((i) => i.category.toLowerCase() === "ingredients");
  const productItems = rawItems.filter((i) => i.category.toLowerCase() !== "ingredients");

  // Registry of real raw-ingredient rows, keyed by SKU.
  const ingredientMeta = new Map<string, { name: string; cost: number; soldByWeight: boolean }>();
  for (const item of ingredientItems) {
    const u = item.units[0];
    if (!u.sku) continue;
    ingredientMeta.set(u.sku, {
      name: item.name.replace(/\s*\(IG\)\s*$/i, "").trim(),
      cost: u.cost,
      soldByWeight: item.soldByWeight,
    });
  }

  // Largest recipe quantity referencing each ingredient SKU, used to guess
  // whether it's measured in grams (e.g. a shared coffee-bean dose) vs.
  // counted as whole packs/pieces.
  const maxQtyBySku = new Map<string, number>();
  for (const item of productItems) {
    for (const unit of item.units) {
      for (const ref of unit.recipe) {
        maxQtyBySku.set(ref.ingredientSku, Math.max(maxQtyBySku.get(ref.ingredientSku) ?? 0, ref.qty));
      }
    }
  }

  const referencedSkus = new Set(maxQtyBySku.keys());
  const ingredients: ImportIngredient[] = [];
  for (const [sku, meta] of ingredientMeta) {
    const maxQty = maxQtyBySku.get(sku) ?? 0;
    const unit: IngredientUnit = meta.soldByWeight && maxQty > 5 ? "g" : "pc";
    ingredients.push({
      sku,
      name: meta.name,
      unit,
      costPerUnit: meta.cost,
      stockQty: 0,
      reorderLevel: unit === "g" ? 500 : 10,
    });
    referencedSkus.delete(sku);
  }
  if (ingredients.length > 0) {
    warnings.push(
      `Starting stock for ${ingredients.length} imported ingredient(s) was set to 0 (the export doesn't include raw-material stock counts) — use Inventory → Adjust Stock to enter real starting quantities. Reorder levels were also defaulted and are worth reviewing.`
    );
  }

  // Recipe references pointing at a SKU that never appeared as an
  // Ingredients-category row — create a stub so the link isn't silently lost.
  for (const sku of referencedSkus) {
    ingredients.push({
      sku,
      name: `Unknown ingredient (SKU ${sku})`,
      unit: "pc",
      costPerUnit: 0,
      stockQty: 0,
      reorderLevel: 10,
    });
    warnings.push(
      `A recipe referenced ingredient SKU "${sku}", which wasn't found as an Ingredients-category row in the file — created a placeholder; please rename/fix it in Inventory.`
    );
  }

  // Self-stock synthesis: units that were tracked directly in the old
  // system (Track stock = Y) but have no BOM get their own 1:1 ingredient
  // so per-unit stock tracking carries over.
  let selfStockCounter = 0;
  const products: ImportProduct[] = [];
  const categoryNames: string[] = [];
  const seenCategories = new Set<string>();
  const nameCounts = new Map<string, number>();

  for (const item of productItems) {
    if (!seenCategories.has(item.category)) {
      seenCategories.add(item.category);
      categoryNames.push(item.category);
    }
    nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1);

    // Some exports only set the "Track stock" flag on an item's first
    // variant row even when sibling variants also carry real stock counts
    // (an "In stock" value) — treat the whole item as tracked if any unit
    // signals it, so every untracked-but-clearly-stocked sibling still gets
    // its own self-stock ingredient instead of silently losing tracking.
    const itemTracksStock = item.units.some((u) => u.trackStock || u.inStock !== null);

    for (const unit of item.units) {
      if (itemTracksStock && unit.recipe.length === 0) {
        selfStockCounter++;
        const syntheticSku = `SELF:${unit.sku || `${item.name}-${selfStockCounter}`}`;
        const label = item.units.length > 1 ? `${item.name} (${unit.name})` : item.name;
        ingredients.push({
          sku: syntheticSku,
          name: label,
          unit: "pc",
          costPerUnit: unit.cost,
          stockQty: unit.inStock ?? 0,
          reorderLevel: unit.lowStock ?? 10,
          synthesized: true,
        });
        unit.recipe.push({ ingredientSku: syntheticSku, qty: 1 });
      }
      if (unit.priceIsVariable) {
        warnings.push(
          `"${item.name}"${unit.name !== item.name ? ` (${unit.name})` : ""} used open/variable pricing in the source file — priced at 0 on import; set a fixed price in Products.`
        );
      }
    }

    if (item.units.length > 1) {
      const [first, ...rest] = item.units;
      products.push({
        sku: first.sku,
        name: item.name,
        categoryName: item.category,
        active: item.available,
        basePrice: first.price,
        recipe: first.recipe,
        variants: rest.map((u) => ({
          sku: u.sku,
          name: u.name,
          priceDelta: u.price - first.price,
          recipe: u.recipe,
        })),
        modifierGroupNames: item.modifierFlags,
      });
    } else {
      const u = item.units[0];
      products.push({
        sku: u.sku,
        name: item.name,
        categoryName: item.category,
        active: item.available,
        basePrice: u.price,
        recipe: u.recipe,
        variants: [],
        modifierGroupNames: item.modifierFlags,
      });
    }
  }

  const duplicateNames = Array.from(nameCounts.entries()).filter(([, c]) => c > 1);
  if (duplicateNames.length > 0) {
    warnings.push(
      `${duplicateNames.length} product name(s) appear more than once with different SKUs — likely duplicates/old test entries from the source system: ${duplicateNames
        .map(([n, c]) => `"${n}" (×${c})`)
        .join(", ")}. Review and hide/delete the stale ones from Products after import.`
    );
  }

  const modifierGroupNames = new Set<string>();
  for (const item of productItems) for (const m of item.modifierFlags) modifierGroupNames.add(m);
  const modifierGroups: ImportModifierGroup[] = Array.from(modifierGroupNames).map((name) => ({
    name,
    options: [{ name: `Add ${name}`, priceDelta: 0 }],
  }));
  if (modifierGroups.length > 0) {
    warnings.push(
      `Created ${modifierGroups.length} modifier group(s) from the source file's per-item modifier flags (${Array.from(
        modifierGroupNames
      ).join(", ")}) with a placeholder ₱0 upcharge — the export doesn't include modifier pricing, so set the real price in Products → Modifiers.`
    );
  }

  return {
    categories: categoryNames.map((name) => ({ name })),
    ingredients,
    modifierGroups,
    products,
    warnings,
  };
}
