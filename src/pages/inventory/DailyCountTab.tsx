import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { submitInventoryCount } from "../../db/applyInventoryCount";
import { useAuthStore } from "../../store/authStore";
import type { InventoryCount, InventoryCountType } from "../../types";
import { Button, Card, Select, Badge, EmptyState } from "../../components/ui";

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function DailyCountTab() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const pastCounts = useLiveQuery(
    () => db.inventoryCounts.orderBy("createdAt").reverse().limit(20).toArray(),
    []
  );

  const [type, setType] = useState<InventoryCountType>("opening");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewCount, setViewCount] = useState<InventoryCount | null>(null);

  const editedCount = useMemo(
    () => Object.keys(values).length,
    [values]
  );

  function setValue(ingredientId: string, val: string) {
    setValues((prev) => ({ ...prev, [ingredientId]: val }));
  }

  async function handleSubmit() {
    if (!ingredients || ingredients.length === 0) return;
    setSubmitting(true);
    try {
      const map = new Map<string, number>();
      for (const ing of ingredients) {
        const raw = values[ing.id];
        const qty = raw === undefined || raw === "" ? ing.stockQty : parseFloat(raw);
        if (Number.isFinite(qty)) map.set(ing.id, qty);
      }
      await submitInventoryCount(type, date, map, currentUser.id, currentUser.name, notes || undefined);
      setValues({});
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-coffee-400 mb-1 block">Count Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value as InventoryCountType)}>
              <option value="opening">Beginning Inventory (Opening)</option>
              <option value="closing">Ending Inventory (Closing)</option>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-coffee-400 mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
        <p className="text-xs text-coffee-400">
          Every ingredient is pre-filled with its current system stock — just correct the ones
          that differ from what you physically count. Untouched rows are left as-is.
        </p>
      </Card>

      <Card className="divide-y divide-coffee-100">
        {!ingredients || ingredients.length === 0 ? (
          <EmptyState text="No ingredients yet." />
        ) : (
          ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-coffee-900 truncate">{ing.name}</div>
                <div className="text-xs text-coffee-400">
                  System: {ing.stockQty.toLocaleString()} {ing.unit}
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                placeholder={String(ing.stockQty)}
                value={values[ing.id] ?? ""}
                onChange={(e) => setValue(ing.id, e.target.value)}
                className="w-24 shrink-0 rounded-lg border border-coffee-200 px-2 py-2 text-sm text-right outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          ))
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">
            Notes (optional — e.g. spoilage, breakage, count discrepancies)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <Button
          className="w-full"
          size="lg"
          disabled={submitting || !ingredients || ingredients.length === 0}
          onClick={handleSubmit}
        >
          {submitting
            ? "Saving…"
            : `Submit ${type === "opening" ? "Beginning" : "Ending"} Count${
                editedCount > 0 ? ` (${editedCount} changed)` : ""
              }`}
        </Button>
      </Card>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2 px-1">Recent Counts</h3>
        {!pastCounts || pastCounts.length === 0 ? (
          <EmptyState text="No counts recorded yet." />
        ) : (
          <div className="space-y-2">
            {pastCounts.map((c) => {
              const changed = c.lines.filter((l) => Math.abs(l.variance) > 1e-9).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setViewCount(c)}
                  className="w-full text-left bg-white rounded-xl border border-coffee-100 p-3 flex items-center justify-between hover:border-coffee-300"
                >
                  <div>
                    <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                      {c.date}
                      <Badge tone={c.type === "opening" ? "default" : "warning"}>
                        {c.type === "opening" ? "Opening" : "Closing"}
                      </Badge>
                    </div>
                    <div className="text-xs text-coffee-400">
                      By {c.recordedByName} · {format(c.createdAt, "h:mm a")}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-coffee-500">
                    {changed} adjusted
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {viewCount && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewCount(null)} />
          <div className="relative bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-w-lg max-h-[90vh] overflow-y-auto p-5 safe-bottom">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-coffee-900">
                {viewCount.type === "opening" ? "Beginning" : "Ending"} Count · {viewCount.date}
              </h2>
              <button
                onClick={() => setViewCount(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-coffee-500 hover:bg-coffee-100"
              >
                ✕
              </button>
            </div>
            {viewCount.notes && (
              <div className="text-sm text-coffee-600 bg-coffee-50 rounded-lg p-3 mb-3">
                {viewCount.notes}
              </div>
            )}
            <div className="divide-y divide-coffee-100 border border-coffee-100 rounded-lg">
              {viewCount.lines.map((l) => (
                <div key={l.ingredientId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-coffee-700">{l.ingredientName}</span>
                  <span className="text-coffee-500">
                    {l.systemQty} → {l.countedQty} {l.unit}
                  </span>
                  <span
                    className={`font-semibold ${
                      Math.abs(l.variance) < 1e-9
                        ? "text-coffee-400"
                        : l.variance > 0
                          ? "text-emerald-600"
                          : "text-red-600"
                    }`}
                  >
                    {l.variance > 0 ? "+" : ""}
                    {l.variance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
