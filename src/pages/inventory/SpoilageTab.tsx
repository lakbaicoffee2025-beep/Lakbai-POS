import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { adjustIngredientStock } from "../../db/inventory";
import { useAuthStore } from "../../store/authStore";
import { compressImage, readFileAsDataUrl } from "../../lib/image";
import { Button, Card, Input, Select, Badge, EmptyState } from "../../components/ui";

const REASONS = ["Expired", "Dropped/Damaged", "Burnt/Overcooked", "Customer Return", "Other"];

export default function SpoilageTab() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const spoilageLog = useLiveQuery(
    () =>
      db.inventoryMovements
        .where("type")
        .equals("waste")
        .reverse()
        .sortBy("createdAt")
        .then((l) => l.slice(0, 50)),
    []
  );

  const [ingredientId, setIngredientId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const selectedIngredient = ingredients?.find((i) => i.id === ingredientId);

  // Restore whatever was being logged last time — covers an accidental
  // exit before submitting (including a photo already attached). Only
  // fetched once per login session; autosave below stays off until this
  // actually finishes, so it can't race the fetch and overwrite a draft
  // with the form's blank initial state.
  const fetchStartedRef = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    db.spoilageDrafts.get(currentUser.id).then((draft) => {
      if (draft) {
        setIngredientId(draft.ingredientId);
        setQty(draft.qty);
        setReason(draft.reason);
        setNotes(draft.notes);
        setPhoto(draft.photoDataUrl ?? null);
      }
      setRestored(true);
    });
  }, [currentUser.id]);

  useEffect(() => {
    if (!restored) return;
    db.spoilageDrafts.put({
      staffId: currentUser.id,
      ingredientId,
      qty,
      reason,
      notes,
      photoDataUrl: photo ?? undefined,
      updatedAt: Date.now(),
    });
  }, [restored, currentUser.id, ingredientId, qty, reason, notes, photo]);

  async function handlePhotoChange(file: File | undefined) {
    if (!file) {
      setPhoto(null);
      return;
    }
    setPhotoBusy(true);
    try {
      const raw = await readFileAsDataUrl(file);
      setPhoto(await compressImage(raw));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    const qtyNum = parseFloat(qty);
    if (!ingredientId) {
      setError("Select an ingredient.");
      return;
    }
    if (!qtyNum || qtyNum <= 0) {
      setError("Enter a valid quantity.");
      return;
    }
    setSubmitting(true);
    try {
      await adjustIngredientStock(
        ingredientId,
        -Math.abs(qtyNum),
        "waste",
        currentUser.id,
        currentUser.name,
        notes || reason,
        { reason, photoDataUrl: photo ?? undefined }
      );
      setIngredientId("");
      setQty("");
      setReason(REASONS[0]);
      setNotes("");
      setPhoto(null);
      await db.spoilageDrafts.delete(currentUser.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-bold text-coffee-800">Log Spoilage / Damage</h3>
        <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
          <option value="">Select ingredient…</option>
          {(ingredients ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.stockQty.toLocaleString()} {i.unit} on hand)
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Quantity"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="flex-1"
          />
          <span className="flex items-center px-2 text-sm text-coffee-400 shrink-0">
            {selectedIngredient?.unit ?? ""}
          </span>
        </div>
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            className="text-sm"
          />
          {photoBusy && <p className="text-xs text-coffee-400 mt-1">Processing photo…</p>}
          {photo && (
            <img src={photo} alt="Spoilage evidence" className="mt-2 rounded-lg max-h-40 border border-coffee-100" />
          )}
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Logging…" : "Log Spoilage"}
        </Button>
      </Card>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2 px-1">Recent Spoilage</h3>
        {!spoilageLog || spoilageLog.length === 0 ? (
          <EmptyState text="No spoilage logged yet." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {spoilageLog.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2 flex-wrap">
                      {m.ingredientName}
                      <Badge tone="danger">{m.reason ?? "Waste"}</Badge>
                    </div>
                    <div className="text-xs text-coffee-400">
                      {Math.abs(m.qty)} · {m.createdByName} · {format(m.createdAt, "MMM d, h:mm a")}
                    </div>
                    {m.note && m.note !== m.reason && (
                      <div className="text-sm text-coffee-600 mt-1">{m.note}</div>
                    )}
                  </div>
                  {m.photoDataUrl && (
                    <button onClick={() => setViewPhoto(m.photoDataUrl!)} className="shrink-0">
                      <img
                        src={m.photoDataUrl}
                        alt="Spoilage evidence"
                        className="w-14 h-14 rounded-lg object-cover border border-coffee-100"
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewPhoto(null)}
        >
          <img src={viewPhoto} alt="Spoilage evidence" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
