import { useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Product } from "../../types";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { pullAll } from "../../db/remoteSync";
import ProductModal from "./ProductModal";
import { useCartStore } from "../../store/cartStore";
import type { CartLineModifier, ProductVariant } from "../../types";
import {
  SearchIcon,
  GridIcon,
  ListIcon,
  LayersIcon,
  SunIcon,
  MoonIcon,
  RefreshIcon,
  CheckIcon,
  CoffeeIcon,
  AlertTriangleIcon,
} from "../../components/icons";

type ViewMode = "grid" | "list";
const VIEW_MODE_KEY = "lakbai-pos-view-mode";
const GROUP_KEY = "lakbai-pos-group-by-category";

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function loadGroupByCategory(): boolean {
  try {
    return localStorage.getItem(GROUP_KEY) === "1";
  } catch {
    return false;
  }
}

// A small, deterministic set of warm gradients so the product-image
// placeholder tiles (there's no real photography yet) read as a deliberate
// design choice instead of a blank box — cycled by category so items in the
// same category share a look.
const TILE_GRADIENTS = [
  "linear-gradient(135deg, var(--color-accent), #db6b33)",
  "linear-gradient(135deg, #6b4226, #9a6b3f)",
  "linear-gradient(135deg, #4c7a5b, #7fae86)",
  "linear-gradient(135deg, #b0703e, #d9a468)",
  "linear-gradient(135deg, #7d532d, #cca57a)",
];

function tileGradientFor(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return TILE_GRADIENTS[hash % TILE_GRADIENTS.length];
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
  const [groupByCategory, setGroupByCategory] = useState<boolean>(loadGroupByCategory);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "done">("idle");

  async function handleRefresh() {
    if (refreshState === "loading") return;
    setRefreshState("loading");
    await pullAll();
    setRefreshState("done");
    setTimeout(() => setRefreshState("idle"), 1200);
  }

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

  function toggleGroupByCategory() {
    setGroupByCategory((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GROUP_KEY, next ? "1" : "0");
      } catch {
        // best-effort only
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

  function matchesSearch(p: Product): boolean {
    return !query || p.name.toLowerCase().includes(query.toLowerCase());
  }

  // Flat, pill-filtered list — used when not grouping by category.
  const filtered = (products ?? []).filter((p) => {
    if (activeCat !== "all" && p.categoryId !== activeCat) return false;
    return matchesSearch(p);
  });

  // One bucket per category (in sortOrder), each pre-filtered by search —
  // used when grouping by category. Categories with no matching products
  // (after search) are left out entirely rather than showing an empty section.
  const groupedSections = useMemo(() => {
    if (!groupByCategory) return [];
    const byCat = new Map<string, Product[]>();
    for (const p of products ?? []) {
      if (!matchesSearch(p)) continue;
      const list = byCat.get(p.categoryId) ?? [];
      list.push(p);
      byCat.set(p.categoryId, list);
    }
    const sections = (categories ?? [])
      .map((c) => ({ category: c, items: byCat.get(c.id) ?? [] }))
      .filter((s) => s.items.length > 0);
    // Products whose categoryId doesn't match any known category (shouldn't
    // normally happen, but a deleted category would otherwise silently hide
    // them from the grouped view) fall into a catch-all "Other" section.
    const knownIds = new Set((categories ?? []).map((c) => c.id));
    const orphaned = (products ?? []).filter(
      (p) => matchesSearch(p) && !knownIds.has(p.categoryId)
    );
    if (orphaned.length > 0) {
      sections.push({
        category: { id: "__other", name: "Other", sortOrder: Number.MAX_SAFE_INTEGER },
        items: orphaned,
      });
    }
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByCategory, products, categories, query]);

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

  function ProductTile({ p }: { p: Product }) {
    const oos = isOutOfStock(p);
    return (
      <button
        onClick={() => handleQuickAdd(p)}
        className="text-left bg-white rounded-xl border border-coffee-100 p-3 landscape:p-2 shadow-sm active:scale-[0.97] transition-transform dark:bg-coffee-900 dark:border-coffee-800"
      >
        <div
          className="w-full aspect-square landscape:aspect-[4/3] rounded-lg mb-2 landscape:mb-1 flex items-center justify-center text-white/85"
          style={{ background: tileGradientFor(p.categoryId) }}
        >
          <CoffeeIcon size={28} />
        </div>
        <div className="text-sm font-semibold text-coffee-900 leading-tight line-clamp-2 min-h-[2.2em] landscape:min-h-0 dark:text-cream-50">
          {p.name}
        </div>
        <div className="tabnum text-sm font-bold text-accent-dark mt-1 landscape:mt-0.5">
          {formatMoney(p.basePrice, symbol)}
        </div>
        {oos && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-red-600 mt-1">
            <AlertTriangleIcon size={11} />
            Out of stock
          </div>
        )}
      </button>
    );
  }

  function ProductRow({ p }: { p: Product }) {
    const oos = isOutOfStock(p);
    return (
      <button
        onClick={() => handleQuickAdd(p)}
        className="flex items-center gap-3 text-left bg-white rounded-lg border border-coffee-100 px-3 py-2 shadow-sm active:scale-[0.99] transition-transform dark:bg-coffee-900 dark:border-coffee-800"
      >
        <div
          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white/85"
          style={{ background: tileGradientFor(p.categoryId) }}
        >
          <CoffeeIcon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-coffee-900 truncate dark:text-cream-50">
            {p.name}
          </div>
          {oos && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-red-600">
              <AlertTriangleIcon size={10} />
              Out of stock
            </div>
          )}
        </div>
        <div className="tabnum text-sm font-bold text-accent-dark shrink-0">
          {formatMoney(p.basePrice, symbol)}
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 landscape:py-2 space-y-2 landscape:space-y-1.5 border-b border-coffee-100 bg-white shrink-0 dark:border-coffee-800 dark:bg-coffee-900">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-coffee-400">
              <SearchIcon size={16} />
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-lg border border-coffee-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50 dark:placeholder-coffee-400"
            />
          </div>
          <button
            onClick={toggleViewMode}
            aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {viewMode === "grid" ? <ListIcon size={16} /> : <GridIcon size={16} />}
          </button>
          <button
            onClick={toggleGroupByCategory}
            aria-label={groupByCategory ? "Show flat product list" : "Group products by category"}
            aria-pressed={groupByCategory}
            title={groupByCategory ? "Show flat product list" : "Group products by category"}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border ${
              groupByCategory
                ? "border-accent bg-accent/10 text-accent-dark"
                : "border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
            }`}
          >
            <LayersIcon size={16} />
          </button>
          <button
            onClick={onToggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {darkMode ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshState === "loading"}
            aria-label="Refresh menu and stock"
            title="Refresh menu and stock"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white disabled:opacity-60 dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {refreshState === "loading" ? (
              <span className="inline-block animate-spin"><RefreshIcon size={16} /></span>
            ) : refreshState === "done" ? (
              <span className="text-emerald-600 dark:text-emerald-400"><CheckIcon size={16} /></span>
            ) : (
              <RefreshIcon size={16} />
            )}
          </button>
          {headerAction}
        </div>
        {!groupByCategory && (
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
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 landscape:p-2">
        {groupByCategory ? (
          <div className="flex flex-col gap-5">
            {groupedSections.map(({ category, items }) => (
              <div key={category.id}>
                <div className="flex items-baseline gap-2 mb-2 px-0.5">
                  <h3 className="font-display text-lg text-coffee-900 dark:text-cream-50">
                    {category.name}
                  </h3>
                  <span className="text-xs font-semibold text-coffee-400">{items.length}</span>
                </div>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 landscape:gap-2">
                    {items.map((p) => (
                      <ProductTile key={p.id} p={p} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {items.map((p) => (
                      <ProductRow key={p.id} p={p} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {groupedSections.length === 0 && (
              <div className="text-center py-10 text-coffee-400 text-sm">No products found.</div>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 landscape:gap-2">
            {filtered.map((p) => (
              <ProductTile key={p.id} p={p} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-10 text-coffee-400 text-sm">
                No products found.
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((p) => (
              <ProductRow key={p.id} p={p} />
            ))}
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
