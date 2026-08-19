import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { adjustIngredientStock } from "../../db/inventory";
import { useAuthStore } from "../../store/authStore";
import type { Ingredient, IngredientUnit } from "../../types";
import { Button, Card, Input, Modal, Select, Badge, EmptyState } from "../../components/ui";

const UNITS: IngredientUnit[] = ["g", "kg", "ml", "L", "pc", "shot", "scoop", "oz"];

function emptyIngredient(): Omit<Ingredient, "id" | "updatedAt"> {
  return { name: "", unit: "g", stockQty: 0, reorderLevel: 0, costPerUnit: 0 };
}

export default function IngredientsTab() {
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const currentUser = useAuthStore((s) => s.currentUser)!;

  const [form, setForm] = useState(emptyIngredient());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState("0");
  const [adjustType, setAdjustType] = useState<"adjustment_in" | "adjustment_out" | "waste">(
    "adjustment_in"
  );
  const [adjustNote, setAdjustNote] = useState("");

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
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New Ingredient</Button>
      </div>

      {!ingredients || ingredients.length === 0 ? (
        <EmptyState text="No ingredients yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {ingredients.map((i) => {
            const low = i.stockQty <= i.reorderLevel;
            return (
              <div key={i.id} className="flex items-center justify-between px-4 py-3 gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                    {i.name}
                    {low && <Badge tone="danger">Low Stock</Badge>}
                  </div>
                  <div className="text-xs text-coffee-400">
                    {i.stockQty.toLocaleString()} {i.unit} on hand · reorder at{" "}
                    {i.reorderLevel} {i.unit}
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button
                    className="text-coffee-600"
                    onClick={() => {
                      setAdjustTarget(i);
                      setAdjustType("adjustment_in");
                      setAdjustQty("0");
                    }}
                  >
                    Adjust
                  </button>
                  <button className="text-accent-dark" onClick={() => openEdit(i)}>
                    Edit
                  </button>
                </div>
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
            onChange={(e) => setAdjustType(e.target.value as typeof adjustType)}
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
            placeholder="Note (optional)"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
          />
          {adjustTarget && (
            <p className="text-xs text-coffee-400">
              Current stock: {adjustTarget.stockQty} {adjustTarget.unit}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
