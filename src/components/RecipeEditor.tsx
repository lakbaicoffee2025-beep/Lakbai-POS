import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { RecipeItem } from "../types";
import { Select } from "./ui";

export default function RecipeEditor({
  recipe,
  onChange,
}: {
  recipe: RecipeItem[];
  onChange: (recipe: RecipeItem[]) => void;
}) {
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const available = (ingredients ?? []).filter(
    (ing) => !recipe.some((r) => r.ingredientId === ing.id)
  );

  function addRow() {
    if (available.length === 0) return;
    onChange([...recipe, { ingredientId: available[0].id, qty: 1 }]);
  }

  function updateRow(idx: number, patch: Partial<RecipeItem>) {
    const next = recipe.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(recipe.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {recipe.map((r, idx) => {
        const ing = (ingredients ?? []).find((i) => i.id === r.ingredientId);
        return (
          <div key={idx} className="flex items-center gap-2">
            <Select
              value={r.ingredientId}
              onChange={(e) => updateRow(idx, { ingredientId: e.target.value })}
              className="flex-1"
            >
              <option value={r.ingredientId}>{ing?.name ?? "Unknown"}</option>
              {available.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
            <input
              type="number"
              min={0}
              step="any"
              value={r.qty}
              onChange={(e) => updateRow(idx, { qty: parseFloat(e.target.value) || 0 })}
              className="w-20 rounded-lg border border-coffee-200 px-2 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="text-xs text-coffee-400 w-8">{ing?.unit}</span>
            <button
              onClick={() => removeRow(idx)}
              className="text-coffee-300 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        onClick={addRow}
        disabled={available.length === 0}
        className="text-xs font-semibold text-accent-dark disabled:opacity-40"
      >
        + Add Ingredient
      </button>
    </div>
  );
}
