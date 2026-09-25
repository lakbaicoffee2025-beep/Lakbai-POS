import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import type { Shift } from "../types";
import { computeShiftSummary } from "../lib/shiftMath";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { Badge } from "./ui";

export default function ShiftReportView({ shift }: { shift: Shift }) {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const orders = useLiveQuery(
    () => db.orders.where("shiftId").equals(shift.id).toArray(),
    [shift.id]
  );
  const expenses = useLiveQuery(
    () => db.expenses.where("shiftId").equals(shift.id).toArray(),
    [shift.id]
  );

  if (!orders || !expenses) return null;
  const summary = computeShiftSummary(shift, orders, expenses);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-coffee-900">{shift.cashierName}</div>
          <div className="text-xs text-coffee-400">
            {format(shift.startedAt, "MMM d, h:mm a")}
            {shift.endedAt ? ` – ${format(shift.endedAt, "h:mm a")}` : " (ongoing)"}
          </div>
        </div>
        <Badge tone={shift.status === "open" ? "success" : "default"}>
          {shift.status === "open" ? "Open" : "Closed"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Orders" value={String(summary.orderCount)} />
        <Stat label="Net Sales" value={formatMoney(summary.netSales, symbol)} />
        <Stat label="Cash Sales" value={formatMoney(summary.cashSales, symbol)} />
        <Stat label="GCash Sales" value={formatMoney(summary.gcashSales, symbol)} />
        <Stat label="Discounts" value={formatMoney(summary.discountTotal, symbol)} />
        <Stat label="Tax Collected" value={formatMoney(summary.taxTotal, symbol)} />
      </div>

      <div className="rounded-lg border border-coffee-100 divide-y divide-coffee-100 text-sm">
        <Row label="Starting Cash" value={formatMoney(shift.startingCash, symbol)} />
        <Row label="Cash Expenses (paid out)" value={formatMoney(summary.cashExpenses, symbol)} />
        <Row label="Expected Cash" value={formatMoney(summary.expectedCash, symbol)} strong />
        {shift.status === "closed" && (
          <>
            <Row label="Counted Cash" value={formatMoney(shift.countedCash ?? 0, symbol)} />
            <Row
              label="Cash Variance"
              value={formatMoney(shift.cashVariance ?? 0, symbol)}
              tone={
                Math.abs(shift.cashVariance ?? 0) < 0.01
                  ? "ok"
                  : (shift.cashVariance ?? 0) < 0
                    ? "bad"
                    : "warn"
              }
            />
            <Row label="Expected GCash" value={formatMoney(summary.expectedGcash, symbol)} />
            <Row label="Counted GCash" value={formatMoney(shift.countedGcash ?? 0, symbol)} />
            <Row
              label="GCash Variance"
              value={formatMoney(shift.gcashVariance ?? 0, symbol)}
              tone={
                Math.abs(shift.gcashVariance ?? 0) < 0.01
                  ? "ok"
                  : (shift.gcashVariance ?? 0) < 0
                    ? "bad"
                    : "warn"
              }
            />
          </>
        )}
      </div>

      {shift.notes && (
        <div className="text-sm text-coffee-600 bg-coffee-50 rounded-lg p-3">
          <span className="font-medium">Notes: </span>
          {shift.notes}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-coffee-100 p-3">
      <div className="text-xs text-coffee-400">{label}</div>
      <div className="text-base font-bold text-coffee-900">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-coffee-500">{label}</span>
      <span
        className={
          strong
            ? "font-semibold text-coffee-900"
            : tone === "ok"
              ? "text-emerald-600 font-medium"
              : tone === "warn"
                ? "text-amber-600 font-medium"
                : tone === "bad"
                  ? "text-red-600 font-medium"
                  : "text-coffee-700"
        }
      >
        {value}
      </span>
    </div>
  );
}
