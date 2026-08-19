import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { Card, EmptyState } from "../../components/ui";
import ShiftReportView from "../../components/ShiftReportView";
import type { Shift } from "../../types";

export default function ShiftsReportTab() {
  const shifts = useLiveQuery(
    () => db.shifts.orderBy("startedAt").reverse().toArray(),
    []
  );
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const [viewShift, setViewShift] = useState<Shift | null>(null);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      {!shifts || shifts.length === 0 ? (
        <EmptyState text="No shifts recorded yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {shifts.map((s) => (
            <button
              key={s.id}
              onClick={() => setViewShift(s)}
              className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-coffee-50"
            >
              <div>
                <div className="text-sm font-semibold text-coffee-900">
                  {s.cashierName} · {format(s.startedAt, "MMM d, h:mm a")}
                </div>
                <div className="text-xs text-coffee-400">
                  {s.status === "open" ? "Ongoing" : `Ended ${format(s.endedAt!, "h:mm a")}`}
                </div>
              </div>
              <div className="text-right">
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
            </button>
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
    </div>
  );
}
