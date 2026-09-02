import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { adjustIngredientStock } from "../../db/inventory";
import { useAuthStore } from "../../store/authStore";
import type { Ingredient, IngredientUnit } from "../../types";
import { Button, Card, Input, Modal, Select, Badge, EmptyState } from "../../components/ui";

async function isIngredientInUse(ingredientId: string): Promise<boolean> {
  const [products, modifierGroups] = await Promise.all([
    db.products.toArray(),
    db.modifierGroups.toArray(),
  ]);
  const inProducts = products.some(
    (p) =>
      p.recipe.some((r) => r.ingredientId === ingredientId) ||
      p.variants.some((v) => v.recipe.some((r) => r.ingredientId === ingredientId))
  );
  const inModifiers = modifierGroups.some((g) =>
    g.options.some((o) => o.recipe.some((r) => r.ingredientId === ingredientId))
  );
  return inProducts || inModifiers;
}

const UNITS: IngredientUnit[] = ["g", "kg", "ml", "L", "pc", "shot", "scoop", "oz"];

function emptyIngredient(): Omit<Ingredient, "id" | "updatedAt"> {
  return { name: "", unit: "g", stockQty: 0, reorderLevel: 0, costPerUnit: 0 };
}

export default function IngredientsTab() {
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const isAdmin = currentUser.role === "admin";

  const [form, setForm] = useState(emptyIngredient());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState("0");
  const [adjustType, setAdjustType] = useState<"adjustment_in" | "adjustment_out" | "waste">(
    "adjustment_in"
  );
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const noteRequired = adjustType === "adjustment_out" || adjustType === "waste";
  const [query, setQuery] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"reorder" | "supplier" | null>(null);
  const [bulkReorderLevel, setBulkReorderLevel] = useState("0");
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const filteredIngredients = (ingredients ?? []).filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

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
    setSelectedIds(new Set(filteredIngredients.map((i) => i.id)));
  }

  async function handleDelete(i: Ingredient) {
    const inUse = await isIngredientInUse(i.id);
    const warning = inUse
      ? ` This ingredient is used in one or more product/modifier recipes — those recipes will no longer deduct it on sale.`
      : "";
    if (confirm(`Delete "${i.name}"? This can't be undone.${warning}`)) {
      await db.ingredients.delete(i.id);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} selected ingredient(s)? This can't be undone. Any that are used in a product/modifier recipe will no longer deduct on sale.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await db.ingredients.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkReorderLevel() {
    const level = parseFloat(bulkReorderLevel);
    if (!Number.isFinite(level) || level < 0 || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await db.ingredients.bulkUpdate(
        Array.from(selectedIds).map((id) => ({
          key: id,
          changes: { reorderLevel: level, updatedAt: Date.now() },
        }))
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkAction(null);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkSupplier() {
    if (!bulkSupplierId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await db.ingredients.bulkUpdate(
        Array.from(selectedIds).map((id) => ({
          key: id,
          changes: { supplierId: bulkSupplierId, updatedAt: Date.now() },
        }))
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkAction(null);
    } finally {
      setBulkBusy(false);
    }
  }

  function openCreate() {
    setForm(emptyIngredient());
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(i: Ingredient) {
    setForm({
      name: i.name,
      unit: i.unit,
      stockQty: i.stockQty,
      reorderLevel: i.reorderLevel,
      costPerUnit: i.costPerUnit,
      supplierId: i.supplierId,
    });
    setEditingId(i.id);
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) {
      await db.ingredients.update(editingId, { ...form, updatedAt: Date.now() });
    } else {
      await db.ingredients.add({ ...form, id: newId(), updatedAt: Date.now() });
    }
    setOpen(false);
  }

  async function handleAdjustSubmit() {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty) || 0;
    if (qty === 0) return;
    if (noteRequired && !adjustNote.trim()) {
      setAdjustError(
        adjustType === "waste"
          ? "Please note what was damaged/spoiled and why, for accountability."
          : "Please note the reason stock is being removed."
      );
      return;
    }
    setAdjustError(null);
    const delta = adjustType === "adjustment_in" ? Math.abs(qty) : -Math.abs(qty);
    await adjustIngredientStock(
      adjustTarget.id,
      delta,
      adjustType,
      currentUser.id,
      currentUser.name,
      adjustNote || undefined
    );
    setAdjustTarget(null);
    setAdjustQty("0");
    setAdjustNote("");
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search ingredients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        {isAdmin && (
          <Button variant="secondary" onClick={toggleSelectMode}>
            {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
        <Button onClick={openCreate}>+ New Ingredient</Button>
      </div>

      {selectMode && (
        <Card className="p-3 space-y-2 border-accent/40 bg-accent/5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-coffee-700">
              {selectedIds.size} selected
            </span>
            <button className="font-semibold text-accent-dark" onClick={selectAllFiltered}>
              Select all ({filteredIngredients.length})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction("reorder")}
            >
              Set Reorder Level
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIds.size === 0 || !suppliers || suppliers.length === 0}
              onClick={() => setBulkAction("supplier")}
            >
              Assign Supplier
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

      {filteredIngredients.length === 0 ? (
        <EmptyState text={query ? "No ingredients match your search." : "No ingredients yet."} />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {filteredIngredients.map((i) => {
            const low = i.stockQty <= i.reorderLevel;
            return (
              <div key={i.id} className="flex items-center justify-between px-4 py-3 gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(i.id)}
                    onChange={() => toggleSelected(i.id)}
                    className="w-4 h-4 shrink-0 accent-accent"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                    {i.name}
                    {low && <Badge tone="danger">Low Stock</Badge>}
                  </div>
                  <div className="text-xs text-coffee-400">
                    {i.stockQty.toLocaleString()} {i.unit} on hand · reorder at{" "}
                    {i.reorderLevel} {i.unit}
                  </div>
                </div>
                {!selectMode && (
                  <div className="flex gap-3 text-xs font-semibold shrink-0">
                    <button
                      className="text-coffee-600"
                      onClick={() => {
                        setAdjustTarget(i);
                        setAdjustType("adjustment_in");
                        setAdjustQty("0");
                        setAdjustNote("");
                        setAdjustError(null);
                      }}
                    >
                      Adjust
                    </button>
                    <button className="text-accent-dark" onClick={() => openEdit(i)}>
                      Edit
                    </button>
                    {isAdmin && (
                      <button className="text-red-600" onClick={() => handleDelete(i)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Ingredient" : "New Ingredient"}
        footer={
          <Button onClick={handleSave} className="w-full">
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Ingredient name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Unit</label>
              <Select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as IngredientUnit })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Cost / unit</label>
              <Input
                type="number"
                value={form.costPerUnit}
                onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">
                {editingId ? "Current Stock" : "Starting Stock"}
              </label>
              <Input
                type="number"
                value={form.stockQty}
                onChange={(e) => setForm({ ...form, stockQty: parseFloat(e.target.value) || 0 })}
                disabled={!!editingId}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Reorder Level</label>
              <Input
                type="number"
                value={form.reorderLevel}
                onChange={(e) =>
                  setForm({ ...form, reorderLevel: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          {editingId && (
            <p className="text-xs text-coffee-400">
              Use "Adjust" from the list to change stock quantity so movements stay logged.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`Adjust Stock · ${adjustTarget?.name ?? ""}`}
        footer={
          <Button onClick={handleAdjustSubmit} className="w-full">
            Apply Adjustment
          </Button>
        }
      >
        <div className="space-y-3">
          <Select
            value={adjustType}
            onChange={(e) => {
              setAdjustType(e.target.value as typeof adjustType);
              setAdjustError(null);
            }}
          >
            <option value="adjustment_in">Stock In (received/counted extra)</option>
            <option value="adjustment_out">Stock Out (manual removal)</option>
            <option value="waste">Waste / Spoilage</option>
          </Select>
          <Input
            type="number"
            placeholder="Quantity"
            value={adjustQty}
            onChange={(e) => setAdjustQty(e.target.value)}
          />
          <Input
            placeholder={
              noteRequired
                ? adjustType === "waste"
                  ? "What was damaged/spoiled? (required)"
                  : "Reason for removal (required)"
                : "Note (optional)"
            }
            value={adjustNote}
            onChange={(e) => {
              setAdjustNote(e.target.value);
              if (adjustError) setAdjustError(null);
            }}
          />
          {adjustError && <p className="text-xs text-red-600">{adjustError}</p>}
          {adjustTarget && (
            <p className="text-xs text-coffee-400">
              Current stock: {adjustTarget.stockQty} {adjustTarget.unit}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={bulkAction === "reorder"}
        onClose={() => setBulkAction(null)}
        title={`Set Reorder Level · ${selectedIds.size} ingredient(s)`}
        footer={
          <Button onClick={handleBulkReorderLevel} disabled={bulkBusy} className="w-full">
            {bulkBusy ? "Applying…" : "Apply to Selected"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            type="number"
            placeholder="New reorder level"
            value={bulkReorderLevel}
            onChange={(e) => setBulkReorderLevel(e.target.value)}
          />
          <p className="text-xs text-coffee-400">
            Overwrites the reorder level on all {selectedIds.size} selected ingredient(s).
          </p>
        </div>
      </Modal>

      <Modal
        open={bulkAction === "supplier"}
        onClose={() => setBulkAction(null)}
        title={`Assign Supplier · ${selectedIds.size} ingredient(s)`}
        footer={
          <Button onClick={handleBulkSupplier} disabled={bulkBusy || !bulkSupplierId} className="w-full">
            {bulkBusy ? "Applying…" : "Apply to Selected"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Select value={bulkSupplierId} onChange={(e) => setBulkSupplierId(e.target.value)}>
            <option value="">Select a supplier…</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-coffee-400">
            Sets the default supplier on all {selectedIds.size} selected ingredient(s).
          </p>
        </div>
      </Modal>
    </div>
  );
}
