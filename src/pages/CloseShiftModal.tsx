import { useState } from "react";
import type { Shift } from "../types";
import type { ShiftSummary } from "../lib/shiftMath";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { useShiftStore } from "../store/shiftStore";
import { Modal, Button } from "../components/ui";

export default function CloseShiftModal({
  shift,
  summary,
  onClose,
  onClosed,
}: {
  shift: Shift;
  summary: ShiftSummary;
  onClose: () => void;
  onClosed: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const closeShift = useShiftStore((s) => s.closeShift);
  const [countedCash, setCountedCash] = useState(summary.expectedCash.toFixed(2));
  const [countedGcash, setCountedGcash] = useState(summary.expectedGcash.toFixed(2));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cashVariance = (parseFloat(countedCash) || 0) - summary.expectedCash;
  const gcashVariance = (parseFloat(countedGcash) || 0) - summary.expectedGcash;

  async function handleSubmit() {
    setSubmitting(true);
    await closeShift(shift.id, {
      countedCash: parseFloat(countedCash) || 0,
      countedGcash: parseFloat(countedGcash) || 0,
      expectedCash: summary.expectedCash,
      expectedGcash: summary.expectedGcash,
      notes: notes || undefined,
    });
    setSubmitting(false);
    onClosed();
  }

  return (
    <Modal open onClose={onClose} title="Close Shift · Cash Count">
      <div className="space-y-4">
        <div className="rounded-lg bg-coffee-50 p-3 text-sm space-y-1">
          <div className="flex justify-between text-coffee-600">
            <span>Orders</span>
            <span>{summary.orderCount}</span>
          </div>
          <div className="flex justify-between text-coffee-600">
            <span>Net Sales</span>
            <span>{formatMoney(summary.netSales, symbol)}</span>
          </div>
          <div className="flex justify-between text-coffee-600">
            <span>Starting Cash</span>
            <span>{formatMoney(shift.startingCash, symbol)}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-xs font-medium text-coffee-500">
              Counted Cash
            </label>
            <span className="text-xs text-coffee-400">
              Expected {formatMoney(summary.expectedCash, symbol)}
            </span>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <div
            className={`text-xs font-medium mt-1 ${
              Math.abs(cashVariance) < 0.01
                ? "text-emerald-600"
                : cashVariance > 0
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            Variance: {formatMoney(cashVariance, symbol)}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-xs font-medium text-coffee-500">
              Counted GCash
            </label>
            <span className="text-xs text-coffee-400">
              Expected {formatMoney(summary.expectedGcash, symbol)}
            </span>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={countedGcash}
            onChange={(e) => setCountedGcash(e.target.value)}
            className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <div
            className={`text-xs font-medium mt-1 ${
              Math.abs(gcashVariance) < 0.01
                ? "text-emerald-600"
                : gcashVariance > 0
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            Variance: {formatMoney(gcashVariance, symbol)}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-coffee-500 mb-1 block">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Closing…" : "Confirm & Close Shift"}
        </Button>
      </div>
    </Modal>
  );
}
