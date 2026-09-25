import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { bulkRestock } from "../../db/inventory";
import { useAuthStore } from "../../store/authStore";
import { Button, Card, Input, EmptyState } from "../../components/ui";

export default function RestockTab() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const [query, setQuery] = useState("");
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const recentRestocks = useLiveQuery(
    () =>
      db.inventoryMovements
        .where("type")
        .equals("adjustment_in")
        .reverse()
        .sortBy("createdAt")
        .then((l) => l.filter((m) => m.note?.startsWith("Restock")).slice(0, 30)),
    []
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore whatever was entered last time — covers an accidental exit
  // before hitting Add Stock. Only fetched once per login session;
  // autosave below stays off until this actually finishes, so it can't
  // race the fetch and overwrite a draft with the form's blank initial
  // state.
  const fetchStartedRef = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    db.restockDrafts.get(currentUser.id).then((draft) => {
      if (draft) {
        setValues(draft.values);
        setNote(draft.note);
      }
      setRestored(true);
    });
  }, [currentUser.id]);

  useEffect(() => {
    if (!restored) return;
    db.restockDrafts.put({ staffId: currentUser.id, values, note, updatedAt: Date.now() });
  }, [restored, currentUser.id, values, note]);

  const filtered = (ingredients ?? []).filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

  const enteredCount = useMemo(
    () => Object.values(values).filter((v) => parseFloat(v) > 0).length,
    [values]
  );

  function setValue(id: string, val: string) {
    setValues((prev) => ({ ...prev, [id]: val }));
  }

  async function handleSubmit() {
    setError(null);
    const entries = Object.entries(values)
      .map(([ingredientId, val]) => ({ ingredientId, qty: parseFloat(val) || 0 }))
      .filter((e) => e.qty > 0);
    if (entries.length === 0) {
      setError("Enter a received quantity for at least one ingredient.");
      return;
    }
    setSubmitting(true);
    try {
      await bulkRestock(
        entries,
        currentUser.id,
        currentUser.name,
        note.trim() ? `Restock: ${note.trim()}` : "Restock"
      );
      setValues({});
      setNote("");
      await db.restockDrafts.delete(currentUser.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-bold text-coffee-800">Restock Ingredients</h3>
        <p className="text-xs text-coffee-400">
          Enter the quantity received for whichever ingredients you're restocking — leave the
          rest blank. Good for a quick supply run outside a formal purchase order.
        </p>
        <Input
          placeholder="Search ingredients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

      <Card className="divide-y divide-coffee-100">
        {filtered.length === 0 ? (
          <EmptyState text={query ? "No ingredients match your search." : "No ingredients yet."} />
        ) : (
          filtered.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-coffee-900 truncate">{ing.name}</div>
                <div className="text-xs text-coffee-400">
                  {ing.stockQty.toLocaleString()} {ing.unit} on hand
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="0"
                  value={values[ing.id] ?? ""}
                  onChange={(e) => setValue(ing.id, e.target.value)}
                  className="w-20 rounded-lg border border-coffee-200 px-2 py-2 text-sm text-right outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
                <span className="text-xs text-coffee-400 w-8">{ing.unit}</span>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Note (optional)</label>
          <Input
            placeholder="e.g. Bought from SM Supermarket"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
          {submitting
            ? "Saving…"
            : `Add Stock${enteredCount > 0 ? ` (${enteredCount} item${enteredCount > 1 ? "s" : ""})` : ""}`}
        </Button>
      </Card>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2 px-1">Recent Restocks</h3>
        {!recentRestocks || recentRestocks.length === 0 ? (
          <EmptyState text="No restocks logged yet." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {recentRestocks.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-coffee-900 truncate">
                    {m.ingredientName}
                  </div>
                  <div className="text-xs text-coffee-400">
                    {m.createdByName} · {format(m.createdAt, "MMM d, h:mm a")}
                    {m.note && m.note !== "Restock" ? ` · ${m.note.replace(/^Restock:\s*/, "")}` : ""}
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-600 shrink-0">+{m.qty}</div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
