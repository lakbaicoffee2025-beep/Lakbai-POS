import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import type { Product, ProductVariant } from "../../types";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { Button, Card, Input, Modal, Select, Badge, EmptyState } from "../../components/ui";
import RecipeEditor from "../../components/RecipeEditor";

function emptyProduct(categoryId: string): Product {
  return {
    id: "",
    name: "",
    categoryId,
    basePrice: 0,
    active: true,
    recipe: [],
    variants: [],
    modifierGroupIds: [],
    sortOrder: 0,
    trackStock: true,
  };
}

export default function ProductsTab() {
  const products = useLiveQuery(
    () => db.products.toArray().then((l) => l.sort((a, b) => a.sortOrder - b.sortOrder)),
    []
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const modifierGroups = useLiveQuery(() => db.modifierGroups.toArray(), []);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [form, setForm] = useState<Product>(emptyProduct(""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"category" | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const filteredProducts = (products ?? []).filter((p) => {
    if (activeCat !== "all" && p.categoryId !== activeCat) return false;
    return p.name.toLowerCase().includes(query.toLowerCase());
  });

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} selected product(s)? This can't be undone. Past sales already made with these products are unaffected.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await db.products.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkShowHide(active: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await db.products.bulkUpdate(
        Array.from(selectedIds).map((id) => ({ key: id, changes: { active } }))
      );
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkCategory() {
    if (!bulkCategoryId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await db.products.bulkUpdate(
        Array.from(selectedIds).map((id) => ({ key: id, changes: { categoryId: bulkCategoryId } }))
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkAction(null);
    } finally {
      setBulkBusy(false);
    }
  }

  function openCreate() {
    setForm(emptyProduct(categories?.[0]?.id ?? ""));
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(p: Product) {
    setForm(structuredClone(p));
    setEditingId(p.id);
    setOpen(true);
  }

  function addVariant() {
    const v: ProductVariant = { id: newId(), name: "", priceDelta: 0, recipe: [] };
    setForm({ ...form, variants: [...form.variants, v] });
  }
  function updateVariant(idx: number, patch: Partial<ProductVariant>) {
    const variants = form.variants.slice();
    variants[idx] = { ...variants[idx], ...patch };
    setForm({ ...form, variants });
  }
  function removeVariant(idx: number) {
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== idx) });
  }

  function toggleModifierGroup(id: string) {
    const has = form.modifierGroupIds.includes(id);
    setForm({
      ...form,
      modifierGroupIds: has
        ? form.modifierGroupIds.filter((g) => g !== id)
        : [...form.modifierGroupIds, id],
    });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.categoryId) {
      alert("Name and category are required.");
      return;
    }
    if (editingId) {
      await db.products.put({ ...form, id: editingId });
    } else {
      const sortOrder = products?.filter((p) => p.categoryId === form.categoryId).length ?? 0;
      await db.products.add({ ...form, id: newId(), sortOrder });
    }
    setOpen(false);
  }

  async function toggleActive(p: Product) {
    await db.products.update(p.id, { active: !p.active });
  }

  async function handleDelete(p: Product) {
    if (confirm(`Delete "${p.name}"? This can't be undone. Past sales already made with this product are unaffected.`)) {
      await db.products.delete(p.id);
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button variant="secondary" onClick={toggleSelectMode}>
          {selectMode ? "Cancel" : "Select"}
        </Button>
        <Button onClick={openCreate} disabled={!categories || categories.length === 0}>
          + New Product
        </Button>
      </div>
      {(!categories || categories.length === 0) && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Create a category first before adding products.
        </div>
      )}

      {categories && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
              activeCat === "all" ? "bg-coffee-900 text-cream-50" : "bg-coffee-100 text-coffee-700"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium ${
                activeCat === c.id ? "bg-coffee-900 text-cream-50" : "bg-coffee-100 text-coffee-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {selectMode && (
        <Card className="p-3 space-y-2 border-accent/40 bg-accent/5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-coffee-700">{selectedIds.size} selected</span>
            <button className="font-semibold text-accent-dark" onClick={selectAllFiltered}>
              Select all ({filteredProducts.length})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction("category")}
            >
              Change Category
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => handleBulkShowHide(true)}
            >
              Show
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => handleBulkShowHide(false)}
            >
              Hide
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={handleBulkDelete}
            >
              Delete Selected
            </Button>
          </div>
        </Card>
      )}

      {filteredProducts.length === 0 ? (
        <EmptyState text={query ? "No products match your search." : "No products yet."} />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {filteredProducts.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-2">
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  className="w-4 h-4 shrink-0 accent-accent"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                  {p.name}
                  {!p.active && <Badge>Inactive</Badge>}
                </div>
                <div className="text-xs text-coffee-400">
                  {categories?.find((c) => c.id === p.categoryId)?.name} ·{" "}
                  {formatMoney(p.basePrice, symbol)} · {p.recipe.length} ingredient(s)
                </div>
              </div>
              {!selectMode && (
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button className="text-coffee-600" onClick={() => toggleActive(p)}>
                    {p.active ? "Hide" : "Show"}
                  </button>
                  <button className="text-accent-dark" onClick={() => openEdit(p)}>
                    Edit
                  </button>
                  <button className="text-red-600" onClick={() => handleDelete(p)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Product" : "New Product"}
        wide
        footer={
          <Button onClick={handleSave} className="w-full">
            Save Product
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Product name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-2">
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="flex-1"
            >
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-coffee-400">{symbol}</span>
              <input
                type="number"
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: parseFloat(e.target.value) || 0 })}
                className="w-24 rounded-lg border border-coffee-200 px-2 py-2.5 text-sm"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-coffee-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.trackStock !== false}
              onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
            />
            <span>
              Track stock for this product — deducts ingredients on sale and warns when out of
              stock. Turn off for items you don't want inventory-tracked (e.g. quick specials).
            </span>
          </label>

          <div>
            <div className="text-sm font-semibold text-coffee-800 mb-2">
              Base Recipe (ingredients consumed per sale)
            </div>
            <RecipeEditor recipe={form.recipe} onChange={(recipe) => setForm({ ...form, recipe })} />
          </div>

          <div>
            <div className="text-sm font-semibold text-coffee-800 mb-2">
              Size Variants (optional)
            </div>
            <div className="space-y-2">
              {form.variants.map((v, idx) => (
                <div key={v.id} className="rounded-lg border border-coffee-100 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="e.g. 16oz"
                      value={v.name}
                      onChange={(e) => updateVariant(idx, { name: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-coffee-400">+{symbol}</span>
                      <input
                        type="number"
                        value={v.priceDelta}
                        onChange={(e) =>
                          updateVariant(idx, { priceDelta: parseFloat(e.target.value) || 0 })
                        }
                        className="w-20 rounded-lg border border-coffee-200 px-2 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => removeVariant(idx)}
                      className="text-coffee-300 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                  <RecipeEditor
                    recipe={v.recipe}
                    onChange={(recipe) => updateVariant(idx, { recipe })}
                  />
                </div>
              ))}
              <button onClick={addVariant} className="text-xs font-semibold text-accent-dark">
                + Add Variant
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-coffee-800 mb-2">Modifier Groups</div>
            <div className="flex flex-wrap gap-2">
              {(modifierGroups ?? []).map((g) => {
                const active = form.modifierGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleModifierGroup(g.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      active
                        ? "border-accent bg-accent/10 text-accent-dark"
                        : "border-coffee-200 text-coffee-600"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
              {(!modifierGroups || modifierGroups.length === 0) && (
                <span className="text-xs text-coffee-400">
                  No modifier groups yet — create one in the Modifiers tab.
                </span>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkAction === "category"}
        onClose={() => setBulkAction(null)}
        title={`Change Category · ${selectedIds.size} product(s)`}
        footer={
          <Button onClick={handleBulkCategory} disabled={bulkBusy || !bulkCategoryId} className="w-full">
            {bulkBusy ? "Applying…" : "Apply to Selected"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">Select a category…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-coffee-400">
            Moves all {selectedIds.size} selected product(s) into this category.
          </p>
        </div>
      </Modal>
    </div>
  );
}
