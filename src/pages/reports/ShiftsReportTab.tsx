import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { adminUpdateShift, adminDeleteShift } from "../../db/shiftAdmin";
import { Card, Button, Input, EmptyState, Modal } from "../../components/ui";
import ShiftReportView from "../../components/ShiftReportView";
import type { Shift } from "../../types";

export default function ShiftsReportTab() {
  const shifts = useLiveQuery(
    () => db.shifts.orderBy("startedAt").reverse().toArray(),
    []
  );
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const [viewShift, setViewShift] = useState<Shift | null>(null);
  const [editShift, setEditShift] = useState<Shift | null>(null);

  async function handleDelete(s: Shift) {
    const extra =
      s.status === "open"
        ? " This shift is still open — the cashier will lose their active session."
        : "";
    if (!confirm(`Delete this shift record? This can't be undone.${extra}`)) return;
    await adminDeleteShift(s.id);
    if (viewShift?.id === s.id) setViewShift(null);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      {!shifts || shifts.length === 0 ? (
        <EmptyState text="No shifts recorded yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-2">
              <button
                onClick={() => setViewShift(s)}
                className="min-w-0 flex-1 text-left hover:opacity-80"
              >
                <div className="text-sm font-semibold text-coffee-900">
                  {s.cashierName} · {format(s.startedAt, "MMM d, h:mm a")}
                </div>
                <div className="text-xs text-coffee-400">
                  {s.status === "open" ? "Ongoing" : `Ended ${format(s.endedAt!, "h:mm a")}`}
                </div>
              </button>
              <div className="text-right shrink-0">
                {s.status === "closed" ? (
                  <div
                    className={`text-xs font-medium ${
                      Math.abs(s.cashVariance ?? 0) < 0.01 ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {Math.abs(s.cashVariance ?? 0) < 0.01
                      ? "Balanced"
                      : `Var. ${formatMoney(s.cashVariance ?? 0, symbol)}`}
                  </div>
                ) : (
                  <div className="text-xs font-medium text-emerald-600">Open</div>
                )}
              </div>
              <div className="flex gap-2 text-xs font-semibold shrink-0">
                <button className="text-accent-dark" onClick={() => setEditShift(s)}>
                  Edit
                </button>
                <button className="text-red-600" onClick={() => handleDelete(s)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {viewShift && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewShift(null)} />
          <div className="relative bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-w-lg max-h-[90vh] overflow-y-auto p-5 safe-bottom">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-coffee-900">Shift Report</h2>
              <button
                onClick={() => setViewShift(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-coffee-500 hover:bg-coffee-100"
              >
                ✕
              </button>
            </div>
            <ShiftReportView shift={viewShift} />
          </div>
        </div>
      )}

      {editShift && (
        <EditShiftModal
          shift={editShift}
          symbol={symbol}
          onClose={() => setEditShift(null)}
          onSaved={() => setEditShift(null)}
        />
      )}
    </div>
  );
}

function EditShiftModal({
  shift,
  symbol,
  onClose,
  onSaved,
}: {
  shift: Shift;
  symbol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startingCash, setStartingCash] = useState(String(shift.startingCash));
  const [countedCash, setCountedCash] = useState(String(shift.countedCash ?? 0));
  const [countedGcash, setCountedGcash] = useState(String(shift.countedGcash ?? 0));
  const [notes, setNotes] = useState(shift.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await adminUpdateShift(shift.id, {
        startingCash: parseFloat(startingCash) || 0,
        countedCash: parseFloat(countedCash) || 0,
        countedGcash: parseFloat(countedGcash) || 0,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit Shift · ${shift.cashierName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={handleSave}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">
            Starting Cash ({symbol})
          </label>
          <Input
            type="number"
            inputMode="decimal"
            value={startingCash}
            onChange={(e) => setStartingCash(e.target.value)}
          />
        </div>

        {shift.status === "closed" ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">
                Counted Cash ({symbol})
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">
                Counted GCash ({symbol})
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={countedGcash}
                onChange={(e) => setCountedGcash(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-coffee-400">
            This shift is still open — counted cash/GCash aren't recorded until it's closed.
          </p>
        )}

        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {shift.status === "closed" && (
          <p className="text-xs text-coffee-400">
            Expected cash/GCash and the variance shown in reports will be recalculated from this
            shift's actual sales and expenses.
          </p>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
