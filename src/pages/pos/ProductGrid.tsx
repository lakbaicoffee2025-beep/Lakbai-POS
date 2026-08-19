import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Product } from "../../types";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import ProductModal from "./ProductModal";
import { useCartStore } from "../../store/cartStore";
import type { CartLineModifier, ProductVariant } from "../../types";

export default function ProductGrid() {
  const categories = useLiveQuery(
    () => db.categories.orderBy("sortOrder").toArray(),
    []
  );
  const products = useLiveQuery(
    () =>
      db.products
        .filter((p) => p.active)
        .toArray()
        .then((list) => list.sort((a, b) => a.sortOrder - b.sortOrder)),
    []
  );
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [activeCat, setActiveCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const addLine = useCartStore((s) => s.addLine);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ing of ingredients ?? []) map.set(ing.id, ing.stockQty);
    return map;
  }, [ingredients]);

  function isOutOfStock(p: Product): boolean {
    return p.recipe.some((r) => (stockMap.get(r.ingredientId) ?? 0) < r.qty);
  }

  const filtered = (products ?? []).filter((p) => {
    if (activeCat !== "all" && p.categoryId !== activeCat) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  function handleQuickAdd(p: Product) {
    if (p.variants.length > 0 || p.modifierGroupIds.length > 0) {
      setOpenProduct(p);
      return;
    }
    addLine({
      productId: p.id,
      productName: p.name,
      unitPrice: p.basePrice,
      qty: 1,
      modifiers: [],
    });
  }

  function handleModalAdd(
    p: Product,
    payload: {
      variant?: ProductVariant;
      modifiers: CartLineModifier[];
      qty: number;
      notes?: string;
    }
  ) {
    addLine({
      productId: p.id,
      productName: p.name,
      variantId: payload.variant?.id,
      variantName: payload.variant?.name,
      unitPrice: p.basePrice + (payload.variant?.priceDelta ?? 0),
      qty: payload.qty,
      modifiers: payload.modifiers,
      notes: payload.notes,
    });
    setOpenProduct(null);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 landscape:py-2 space-y-2 landscape:space-y-1.5 border-b border-coffee-100 bg-white shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
              activeCat === "all"
                ? "bg-coffee-900 text-cream-50"
                : "bg-coffee-100 text-coffee-700"
            }`}
          >
            All
          </button>
          {(categories ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
                activeCat === c.id
                  ? "bg-coffee-900 text-cream-50"
                  : "bg-coffee-100 text-coffee-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 landscape:p-2">
        <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 landscape:gap-2">
          {filtered.map((p) => {
            const oos = isOutOfStock(p);
            return (
              <button
                key={p.id}
                disabled={oos}
                onClick={() => handleQuickAdd(p)}
                className="text-left bg-white rounded-xl border border-coffee-100 p-3 landscape:p-2 shadow-sm active:scale-[0.97] transition-transform disabled:opacity-40 disabled:pointer-events-none"
              >
                <div className="w-full aspect-square landscape:aspect-[4/3] rounded-lg bg-coffee-100 mb-2 landscape:mb-1 flex items-center justify-center text-2xl">
                  ☕
                </div>
                <div className="text-sm font-semibold text-coffee-900 leading-tight line-clamp-2 min-h-[2.2em] landscape:min-h-0">
                  {p.name}
                </div>
                <div className="text-sm font-bold text-accent-dark mt-1 landscape:mt-0.5">
                  {formatMoney(p.basePrice, symbol)}
                </div>
                {oos && (
                  <div className="text-[11px] font-medium text-red-600 mt-1">
                    Out of stock
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-10 text-coffee-400 text-sm">
              No products found.
            </div>
          )}
        </div>
      </div>

      {openProduct && (
        <ProductModal
          product={openProduct}
          onClose={() => setOpenProduct(null)}
          onAdd={(payload) => handleModalAdd(openProduct, payload)}
        />
      )}
    </div>
  );
}
