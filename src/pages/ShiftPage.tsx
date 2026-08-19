import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { computeShiftSummary } from "../lib/shiftMath";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { PageHeader, Card, Button, Badge, EmptyState } from "../components/ui";
import ShiftReportView from "../components/ShiftReportView";
import CloseShiftModal from "./CloseShiftModal";
import type { Expense, Order, Shift } from "../types";

export default function ShiftPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [closeOpen, setCloseOpen] = useState(false);
  const [viewShift, setViewShift] = useState<Shift | null>(null);

  const pastShifts = useLiveQuery(
    () =>
      db.shifts
        .where("cashierId")
        .equals(currentUser.id)
        .filter((s) => s.status === "closed")
        .reverse()
        .sortBy("startedAt"),
    [currentUser.id]
  );

  const activeOrders = useLiveQuery(
    () =>
      activeShift
        ? db.orders.where("shiftId").equals(activeShift.id).toArray()
        : Promise.resolve<Order[]>([]),
    [activeShift?.id]
  );
  const activeExpenses = useLiveQuery(
    () =>
      activeShift
        ? db.expenses.where("shiftId").equals(activeShift.id).toArray()
        : Promise.resolve<Expense[]>([]),
    [activeShift?.id]
  );

  const summary =
    activeShift && activeOrders && activeExpenses
      ? computeShiftSummary(activeShift, activeOrders, activeExpenses)
      : null;

  return (
    <div>
      <PageHeader title="Shift" subtitle="Cash count & shift reports" />

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {activeShift ? (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-coffee-900">Shift In Progress</div>
                <div className="text-xs text-coffee-400">
                  Started {format(activeShift.startedAt, "h:mm a, MMM d")}
                </div>
              </div>
              <Badge tone="success">Open</Badge>
            </div>

            {summary && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <MiniStat label="Orders" value={String(summary.orderCount)} />
                <MiniStat
                  label="Net Sales"
                  value={formatMoney(summary.netSales, symbol)}
                />
                <MiniStat
                  label="Cash in Drawer (exp.)"
                  value={formatMoney(summary.expectedCash, symbol)}
                />
                <MiniStat
                  label="GCash Received"
                  value={formatMoney(summary.expectedGcash, symbol)}
                />
              </div>
            )}

            <Button className="w-full" size="lg" onClick={() => setCloseOpen(true)}>
              Close Shift
            </Button>
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <div className="text-3xl mb-2">🕒</div>
            <div className="font-semibold text-coffee-900">No Active Shift</div>
            <div className="text-sm text-coffee-400 mt-1">
              Open a shift from the POS screen to start selling.
            </div>
          </Card>
        )}

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2 px-1">
            Past Shifts
          </h3>
          {!pastShifts || pastShifts.length === 0 ? (
            <EmptyState text="No closed shifts yet." />
          ) : (
            <div className="space-y-2">
              {pastShifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setViewShift(s)}
                  className="w-full text-left bg-white rounded-xl border border-coffee-100 p-3 flex items-center justify-between hover:border-coffee-300"
                >
                  <div>
                    <div className="text-sm font-semibold text-coffee-900">
                      {format(s.startedAt, "MMM d, yyyy")}
                    </div>
                    <div className="text-xs text-coffee-400">
                      {format(s.startedAt, "h:mm a")} –{" "}
                      {s.endedAt ? format(s.endedAt, "h:mm a") : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-xs font-medium ${
                        Math.abs(s.cashVariance ?? 0) < 0.01
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {Math.abs(s.cashVariance ?? 0) < 0.01
                        ? "Balanced"
                        : `Var. ${formatMoney(s.cashVariance ?? 0, symbol)}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {closeOpen && activeShift && summary && (
        <CloseShiftModal
          shift={activeShift}
          summary={summary}
          onClose={() => setCloseOpen(false)}
          onClosed={() => setCloseOpen(false)}
        />
      )}

      {viewShift && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setViewShift(null)}
          />
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-coffee-50 p-3">
      <div className="text-xs text-coffee-400">{label}</div>
      <div className="text-sm font-bold text-coffee-900">{value}</div>
    </div>
  );
}
