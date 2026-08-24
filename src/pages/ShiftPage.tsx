import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { useDarkModeStore } from "../store/darkModeStore";
import { computeShiftSummary } from "../lib/shiftMath";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { PageHeader, Card, Button, Badge, EmptyState } from "../components/ui";
import ShiftReportView from "../components/ShiftReportView";
import CloseShiftModal from "./CloseShiftModal";
import PaidOutModal from "./PaidOutModal";
import { PAID_OUT_CATEGORY } from "../db/paidOut";
import type { Expense, Order, Shift } from "../types";

export default function ShiftPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings?.currencySymbol ?? "₱";
  const blind = currentUser.role === "cashier" && !!settings?.hideSalesFromCashiers;
  const darkMode = useDarkModeStore((s) => s.darkMode);
  const toggleDarkMode = useDarkModeStore((s) => s.toggleDarkMode);

  const [closeOpen, setCloseOpen] = useState(false);
  const [paidOutOpen, setPaidOutOpen] = useState(false);
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

  const paidOuts = (activeExpenses ?? []).filter((e) => e.category === PAID_OUT_CATEGORY);
  const paidOutTotal = paidOuts.reduce((s, e) => s + e.amount, 0);

  return (
    <div className={`bg-cream-50 dark:bg-coffee-950 min-h-full ${darkMode ? "dark" : ""}`}>
      <PageHeader
        title="Shift"
        subtitle="Cash count & shift reports"
        action={
          <button
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        }
      />

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {activeShift ? (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-coffee-900 dark:text-cream-50">Shift In Progress</div>
                <div className="text-xs text-coffee-400">
                  Started {format(activeShift.startedAt, "h:mm a, MMM d")}
                </div>
              </div>
              <Badge tone="success">Open</Badge>
            </div>

            {blind ? (
              <div className="text-sm text-coffee-500 bg-coffee-50 rounded-lg p-3 mb-4 dark:bg-coffee-800 dark:text-coffee-300">
                Sales figures are hidden during your shift. Count your cash and GCash drawer
                when you close out.
              </div>
            ) : (
              summary && (
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
              )
            )}

            {paidOuts.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-coffee-500 uppercase tracking-wide">
                    Paid Outs
                  </h4>
                  <span className="text-xs font-semibold text-coffee-600">
                    -{formatMoney(paidOutTotal, symbol)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {paidOuts.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between text-xs bg-coffee-50 rounded-lg px-3 py-2 dark:bg-coffee-800"
                    >
                      <span className="text-coffee-700 dark:text-coffee-200 truncate">{e.description}</span>
                      <span className="font-semibold text-coffee-900 dark:text-cream-50 shrink-0 ml-2">
                        {formatMoney(e.amount, symbol)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPaidOutOpen(true)}
              >
                Paid Out
              </Button>
              <Button className="flex-[2]" size="lg" onClick={() => setCloseOpen(true)}>
                Close Shift
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <div className="text-3xl mb-2">🕒</div>
            <div className="font-semibold text-coffee-900 dark:text-cream-50">No Active Shift</div>
            <div className="text-sm text-coffee-400 mt-1">
              Open a shift from the POS screen to start selling.
            </div>
          </Card>
        )}

        <div>
          <h3 className="text-sm font-bold text-coffee-800 dark:text-cream-100 mb-2 px-1">
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
                  className="w-full text-left bg-white rounded-xl border border-coffee-100 p-3 flex items-center justify-between hover:border-coffee-300 dark:bg-coffee-900 dark:border-coffee-800 dark:hover:border-coffee-600"
                >
                  <div>
                    <div className="text-sm font-semibold text-coffee-900 dark:text-cream-50">
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
          blind={blind}
          onClose={() => setCloseOpen(false)}
          onClosed={() => setCloseOpen(false)}
        />
      )}

      {paidOutOpen && activeShift && (
        <PaidOutModal shiftId={activeShift.id} onClose={() => setPaidOutOpen(false)} />
      )}

      {viewShift && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setViewShift(null)}
          />
          <div className="relative bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-w-lg max-h-[90vh] overflow-y-auto p-5 safe-bottom dark:bg-coffee-900">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-coffee-900 dark:text-cream-50">Shift Report</h2>
              <button
                onClick={() => setViewShift(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-coffee-500 hover:bg-coffee-100 dark:text-coffee-300 dark:hover:bg-coffee-800"
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
    <div className="rounded-lg bg-coffee-50 p-3 dark:bg-coffee-800">
      <div className="text-xs text-coffee-400">{label}</div>
      <div className="text-sm font-bold text-coffee-900 dark:text-cream-50">{value}</div>
    </div>
  );
}
