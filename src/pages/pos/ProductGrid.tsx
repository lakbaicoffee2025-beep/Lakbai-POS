import { useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Product } from "../../types";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import ProductModal from "./ProductModal";
import { useCartStore } from "../../store/cartStore";
import type { CartLineModifier, ProductVariant } from "../../types";

type ViewMode = "grid" | "list";
const VIEW_MODE_KEY = "lakbai-pos-view-mode";

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export default function ProductGrid({
  headerAction,
  darkMode,
  onToggleDarkMode,
}: {
  headerAction?: ReactNode;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
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
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);

  function toggleViewMode() {
    setViewMode((prev) => {
      const next = prev === "grid" ? "list" : "grid";
      try {
        localStorage.setItem(VIEW_MODE_KEY, next);
      } catch {
        // best-effort only — a private window or blocked storage just won't remember it
      }
      return next;
    });
  }

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ing of ingredients ?? []) map.set(ing.id, ing.stockQty);
    return map;
  }, [ingredients]);

  function isOutOfStock(p: Product): boolean {
    if (p.trackStock === false) return false;
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
      <div className="p-3 landscape:py-2 space-y-2 landscape:space-y-1.5 border-b border-coffee-100 bg-white shrink-0 dark:border-coffee-800 dark:bg-coffee-900">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="flex-1 min-w-0 rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50 dark:placeholder-coffee-400"
          />
          <button
            onClick={toggleViewMode}
            aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {viewMode === "grid" ? "☰" : "▦"}
          </button>
          <button
            onClick={onToggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          {headerAction}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
              activeCat === "all"
                ? "bg-coffee-900 text-cream-50"
                : "bg-coffee-100 text-coffee-700 dark:bg-coffee-800 dark:text-coffee-200"
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
                  : "bg-coffee-100 text-coffee-700 dark:bg-coffee-800 dark:text-coffee-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 landscape:p-2">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 landscape:gap-2">
            {filtered.map((p) => {
              const oos = isOutOfStock(p);
              return (
                <button
                  key={p.id}
                  onClick={() => handleQuickAdd(p)}
                  className="text-left bg-white rounded-xl border border-coffee-100 p-3 landscape:p-2 shadow-sm active:scale-[0.97] transition-transform dark:bg-coffee-900 dark:border-coffee-800"
                >
                  <div className="w-full aspect-square landscape:aspect-[4/3] rounded-lg bg-coffee-100 mb-2 landscape:mb-1 flex items-center justify-center text-2xl dark:bg-coffee-800">
                    ☕
                  </div>
                  <div className="text-sm font-semibold text-coffee-900 leading-tight line-clamp-2 min-h-[2.2em] landscape:min-h-0 dark:text-cream-50">
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
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((p) => {
              const oos = isOutOfStock(p);
              return (
                <button
                  key={p.id}
                  onClick={() => handleQuickAdd(p)}
                  className="flex items-center gap-3 text-left bg-white rounded-lg border border-coffee-100 px-3 py-2 shadow-sm active:scale-[0.99] transition-transform dark:bg-coffee-900 dark:border-coffee-800"
                >
                  <div className="w-9 h-9 shrink-0 rounded-lg bg-coffee-100 flex items-center justify-center text-lg dark:bg-coffee-800">
                    ☕
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-coffee-900 truncate dark:text-cream-50">
                      {p.name}
                    </div>
                    {oos && (
                      <div className="text-[11px] font-medium text-red-600">Out of stock</div>
                    )}
                  </div>
                  <div className="text-sm font-bold text-accent-dark shrink-0">
                    {formatMoney(p.basePrice, symbol)}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-10 text-coffee-400 text-sm">No products found.</div>
            )}
          </div>
        )}
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
