import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import type { ModifierGroup, ModifierOption } from "../../types";
import { Button, Card, Input, Modal, EmptyState } from "../../components/ui";
import RecipeEditor from "../../components/RecipeEditor";

function emptyGroup(): ModifierGroup {
  return { id: "", name: "", min: 0, max: 1, required: false, options: [] };
}

export default function ModifierGroupsTab() {
  const groups = useLiveQuery(() => db.modifierGroups.toArray(), []);
  const [form, setForm] = useState<ModifierGroup>(emptyGroup());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function openCreate() {
    setForm(emptyGroup());
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(g: ModifierGroup) {
    setForm(structuredClone(g));
    setEditingId(g.id);
    setOpen(true);
  }

  function addOption() {
    const opt: ModifierOption = { id: newId(), name: "", priceDelta: 0, recipe: [] };
    setForm({ ...form, options: [...form.options, opt] });
  }
  function updateOption(idx: number, patch: Partial<ModifierOption>) {
    const options = form.options.slice();
    options[idx] = { ...options[idx], ...patch };
    setForm({ ...form, options });
  }
  function removeOption(idx: number) {
    setForm({ ...form, options: form.options.filter((_, i) => i !== idx) });
  }

  async function handleSave() {
    if (!form.name.trim() || form.options.length === 0) {
      alert("Group name and at least one option are required.");
      return;
    }
    if (editingId) {
      await db.modifierGroups.put({ ...form, id: editingId });
    } else {
      await db.modifierGroups.add({ ...form, id: newId() });
    }
    setOpen(false);
  }

  async function handleDelete(g: ModifierGroup) {
    const inUse = await db.products
      .filter((p) => p.modifierGroupIds.includes(g.id))
      .count();
    if (inUse > 0) {
      alert(`Cannot delete: used by ${inUse} product(s).`);
      return;
    }
    if (confirm(`Delete "${g.name}"?`)) await db.modifierGroups.delete(g.id);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New Modifier Group</Button>
      </div>
      {!groups || groups.length === 0 ? (
        <EmptyState text="No modifier groups yet." />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-coffee-900">{g.name}</div>
                  <div className="text-xs text-coffee-400">
                    {g.required ? "Required" : "Optional"} · max {g.max} ·{" "}
                    {g.options.length} option(s)
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button className="text-accent-dark" onClick={() => openEdit(g)}>
                    Edit
                  </button>
                  <button className="text-red-600" onClick={() => handleDelete(g)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {g.options.map((o) => (
                  <span
                    key={o.id}
                    className="text-xs bg-coffee-100 text-coffee-700 rounded-full px-2 py-1"
                  >
                    {o.name}
                    {o.priceDelta > 0 ? ` +₱${o.priceDelta}` : ""}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Modifier Group" : "New Modifier Group"}
        wide
        footer={
          <Button onClick={handleSave} className="w-full">
            Save Group
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            placeholder="Group name e.g. Milk Options"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-3 items-center flex-wrap">
            <label className="flex items-center gap-2 text-sm text-coffee-700">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) =>
                  setForm({ ...form, required: e.target.checked, min: e.target.checked ? 1 : 0 })
                }
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm text-coffee-700">
              Max selections
              <input
                type="number"
                min={1}
                value={form.max}
                onChange={(e) => setForm({ ...form, max: parseInt(e.target.value) || 1 })}
                className="w-16 rounded-lg border border-coffee-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-coffee-800">Options</div>
            {form.options.map((opt, idx) => (
              <div key={opt.id} className="rounded-lg border border-coffee-100 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Option name"
                    value={opt.name}
                    onChange={(e) => updateOption(idx, { name: e.target.value })}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-coffee-400">+₱</span>
                    <input
                      type="number"
                      value={opt.priceDelta}
                      onChange={(e) =>
                        updateOption(idx, { priceDelta: parseFloat(e.target.value) || 0 })
                      }
                      className="w-20 rounded-lg border border-coffee-200 px-2 py-2 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeOption(idx)}
                    className="text-coffee-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <div className="text-xs text-coffee-400 mb-1">
                    Extra ingredients consumed (if any)
                  </div>
                  <RecipeEditor
                    recipe={opt.recipe}
                    onChange={(recipe) => updateOption(idx, { recipe })}
                  />
                </div>
              </div>
            ))}
            <button onClick={addOption} className="text-xs font-semibold text-accent-dark">
              + Add Option
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
