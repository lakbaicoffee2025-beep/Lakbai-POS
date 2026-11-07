import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays } from "date-fns";
import { db } from "../../db/db";
import { useAuthStore } from "../../store/authStore";
import { downloadCsv } from "../../lib/csvExport";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { computeDailyReconciliation, isFlagged } from "../../lib/reconciliation";
import { Card, Badge, Button, Input, EmptyState } from "../../components/ui";
import type { InventoryMovementType } from "../../types";

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  sale: "Sale",
  purchase_receive: "PO Received",
  adjustment_in: "Stock In",
  adjustment_out: "Stock Out",
  waste: "Waste",
};

const RECENT_LIMIT = 100;

function reasonTone(reason: string): "warning" | "success" | "default" {
  if (reason.includes("Discrepancy")) return "warning";
  if (reason.includes("Final")) return "success";
  return "default";
}

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function dayBounds(dateStr: string): [number, number] {
  return [
    new Date(dateStr + "T00:00:00").getTime(),
    new Date(dateStr + "T23:59:59.999").getTime(),
  ];
}

type ViewMode = "day" | "week" | "custom";

export default function MovementLogTab() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const isAdmin = currentUser.role === "admin";
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [mode, setMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(todayStr());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const allCounts = useLiveQuery(() => db.inventoryCounts.toArray(), []);
  const costByIngredient = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i.costPerUnit])),
    [ingredients]
  );

  const weekDates = useMemo(() => {
    const end = new Date(date + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => format(subDays(end, 6 - i), "yyyy-MM-dd"));
  }, [date]);

  const hasCustomRange = mode === "custom" && !!customFrom && !!customTo;

  const [rangeStart, rangeEnd]: [number | null, number | null] = useMemo(() => {
    if (mode === "day") return dayBounds(date);
    if (mode === "week") return [dayBounds(weekDates[0])[0], dayBounds(weekDates[6])[1]];
    if (hasCustomRange) return [dayBounds(customFrom)[0], dayBounds(customTo)[1]];
    return [null, null];
  }, [mode, date, weekDates, hasCustomRange, customFrom, customTo]);

  const movements = useLiveQuery(() => {
    if (rangeStart !== null && rangeEnd !== null) {
      return db.inventoryMovements
        .where("createdAt")
        .between(rangeStart, rangeEnd, true, true)
        .reverse()
        .sortBy("createdAt");
    }
    return db.inventoryMovements.orderBy("createdAt").reverse().limit(RECENT_LIMIT).toArray();
  }, [rangeStart, rangeEnd]);

  // Day mode: sales-vs-actual-count reconciliation for the one selected day,
  // so a discrepancy is visible right alongside the raw movement trail
  // rather than only in the separate Reports > Reconciliation tab.
  const dayRows = useMemo(() => {
    if (mode !== "day" || !ingredients || !allCounts || !movements) return [];
    return computeDailyReconciliation(date, ingredients, allCounts, movements);
  }, [mode, ingredients, allCounts, movements, date]);
  const flaggedDayRows = dayRows.filter(isFlagged);

  // Week mode: same reconciliation, rolled up per day across the 7-day window.
  const weekSummary = useMemo(() => {
    if (mode !== "week" || !ingredients || !allCounts || !movements) return [];
    return weekDates.map((d) => {
      const [dStart, dEnd] = dayBounds(d);
      const dayMovements = movements.filter((m) => m.createdAt >= dStart && m.createdAt <= dEnd);
      const rows = computeDailyReconciliation(d, ingredients, allCounts, dayMovements);
      const flagged = rows.filter(isFlagged);
      const valueImpact = flagged.reduce(
        (s, r) => s + Math.abs(r.discrepancy!) * (costByIngredient.get(r.ingredientId) ?? 0),
        0
      );
      return { date: d, flagged, valueImpact };
    });
  }, [mode, ingredients, allCounts, movements, weekDates, costByIngredient]);

  function handleExport() {
    if (!movements || movements.length === 0) return;
    const rows: (string | number)[][] = [
      ["Date", "Ingredient", "Type", "Qty", "Reason", "Note", "By"],
      ...movements.map((m) => [
        format(m.createdAt, "yyyy-MM-dd HH:mm"),
        m.ingredientName,
        TYPE_LABEL[m.type],
        m.qty,
        m.reason ?? "",
        m.note ?? "",
        m.createdByName,
      ]),
    ];
    const suffix =
      mode === "day" ? date : mode === "week" ? `${weekDates[0]}_to_${weekDates[6]}` : hasCustomRange ? `${customFrom}_to_${customTo}` : "recent";
    downloadCsv(`stock-movements-${suffix}.csv`, rows);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex gap-1.5">
          {(["day", "week", "custom"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                mode === m
                  ? "bg-coffee-900 text-cream-50 border-coffee-900"
                  : "border-coffee-200 text-coffee-700"
              }`}
            >
              {m === "day" ? "Day" : m === "week" ? "Week" : "Custom"}
            </button>
          ))}
        </div>

        {mode !== "custom" ? (
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-coffee-400 mb-1 block">
              {mode === "day" ? "Date" : "Week ending"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-coffee-400 mb-1 block">From</label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-coffee-400 mb-1 block">To</label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            {hasCustomRange && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
              >
                Clear
              </Button>
            )}
          </>
        )}

        {isAdmin && (
          <Button
            size="sm"
            disabled={!movements || movements.length === 0}
            onClick={handleExport}
            className="ml-auto"
          >
            Export CSV
          </Button>
        )}
      </Card>

      {mode === "custom" && !hasCustomRange && (
        <p className="text-xs text-coffee-400 px-1">
          Showing the {RECENT_LIMIT} most recent movements. Set a From/To range above to see
          more or export a specific period.
        </p>
      )}

      {mode === "day" && (
        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">
            Daily Summary — Sales vs. Ending Count
          </h3>
          {flaggedDayRows.length === 0 ? (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              No discrepancies between sales and the ending inventory count for this day.
            </div>
          ) : (
            <Card className="divide-y divide-coffee-100">
              {flaggedDayRows.map((r) => (
                <div key={r.ingredientId} className="flex items-center justify-between px-4 py-2.5 gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-coffee-900">{r.ingredientName}</div>
                    <div className="text-xs text-coffee-400">
                      Sold {r.sold} {r.unit} · Expected {r.expected} {r.unit} · Actual{" "}
                      {r.actualCounted} {r.unit}
                    </div>
                  </div>
                  <Badge tone={r.discrepancy! < 0 ? "danger" : "warning"}>
                    {r.discrepancy! > 0 ? "+" : ""}
                    {r.discrepancy} {r.unit}
                  </Badge>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {mode === "week" && (
        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">
            Weekly Summary — Sales vs. Ending Count
          </h3>
          <Card className="divide-y divide-coffee-100">
            {weekSummary.map((d) => (
              <button
                key={d.date}
                onClick={() => {
                  setDate(d.date);
                  setMode("day");
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-coffee-50"
              >
                <span className="text-sm font-medium text-coffee-900">
                  {format(new Date(d.date + "T00:00:00"), "EEE, MMM d")}
                </span>
                {d.flagged.length === 0 ? (
                  <Badge tone="success">No discrepancies</Badge>
                ) : (
                  <div className="text-right">
                    <Badge tone="danger">
                      {d.flagged.length} discrepanc{d.flagged.length === 1 ? "y" : "ies"}
                    </Badge>
                    <div className="text-xs text-coffee-400 mt-0.5">
                      ~{formatMoney(d.valueImpact, symbol)} impact
                    </div>
                  </div>
                )}
              </button>
            ))}
          </Card>
        </div>
      )}

      {!movements || movements.length === 0 ? (
        <EmptyState text="No inventory movements yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-coffee-900">
                  {m.ingredientName}
                </div>
                <div className="text-xs text-coffee-400 truncate">
                  {format(m.createdAt, "MMM d, h:mm a")} · {m.createdByName}
                  {m.note ? ` · ${m.note}` : ""}
                </div>
                {m.reason && (
                  <div className="mt-1">
                    <Badge tone={reasonTone(m.reason)}>{m.reason}</Badge>
                  </div>
                )}
              </div>
              <div className="text-right flex flex-col items-end gap-1 shrink-0">
                <Badge tone={m.qty >= 0 ? "success" : "danger"}>
                  {TYPE_LABEL[m.type]}
                </Badge>
                <span
                  className={`text-sm font-semibold ${
                    m.qty >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {m.qty >= 0 ? "+" : ""}
                  {m.qty}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
