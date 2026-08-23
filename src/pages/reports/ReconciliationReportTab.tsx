import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays } from "date-fns";
import { db } from "../../db/db";
import { computeDailyReconciliation, type ReconciliationRow } from "../../lib/reconciliation";
import { formatMoney } from "../../lib/format";
import { downloadCsv } from "../../lib/csvExport";
import { useSettingsStore } from "../../store/settingsStore";
import { Card, Badge, Button, EmptyState } from "../../components/ui";

const EPSILON = 1e-9;

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function dayBounds(dateStr: string): [number, number] {
  return [
    new Date(dateStr + "T00:00:00").getTime(),
    new Date(dateStr + "T23:59:59.999").getTime(),
  ];
}

function isFlagged(r: ReconciliationRow): boolean {
  return r.discrepancy !== null && Math.abs(r.discrepancy) > EPSILON;
}

type ViewMode = "day" | "week";

export default function ReconciliationReportTab() {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );
  const allCounts = useLiveQuery(() => db.inventoryCounts.toArray(), []);
  const costByIngredient = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i.costPerUnit])),
    [ingredients]
  );

  const [mode, setMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(todayStr());
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(true);

  const weekDates = useMemo(() => {
    const end = new Date(date + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) =>
      format(subDays(end, 6 - i), "yyyy-MM-dd")
    );
  }, [date]);

  const rangeStart = mode === "day" ? dayBounds(date)[0] : dayBounds(weekDates[0])[0];
  const rangeEnd = mode === "day" ? dayBounds(date)[1] : dayBounds(weekDates[6])[1];

  const rangeMovements = useLiveQuery(
    () => db.inventoryMovements.where("createdAt").between(rangeStart, rangeEnd, true, true).toArray(),
    [rangeStart, rangeEnd]
  );

  const dayRows = useMemo(() => {
    if (!ingredients || !allCounts || !rangeMovements) return [];
    const [dStart, dEnd] = dayBounds(date);
    const dayMovements = rangeMovements.filter((m) => m.createdAt >= dStart && m.createdAt <= dEnd);
    return computeDailyReconciliation(date, ingredients, allCounts, dayMovements).sort((a, b) => {
      const flaggedDiff = Number(isFlagged(b)) - Number(isFlagged(a));
      return flaggedDiff !== 0 ? flaggedDiff : a.ingredientName.localeCompare(b.ingredientName);
    });
  }, [ingredients, allCounts, rangeMovements, date]);

  const visibleDayRows = onlyDiscrepancies ? dayRows.filter(isFlagged) : dayRows;
  const flaggedCount = dayRows.filter(isFlagged).length;

  const weekSummary = useMemo(() => {
    if (!ingredients || !allCounts || !rangeMovements) return [];
    return weekDates.map((d) => {
      const [dStart, dEnd] = dayBounds(d);
      const dayMovements = rangeMovements.filter((m) => m.createdAt >= dStart && m.createdAt <= dEnd);
      const rows = computeDailyReconciliation(d, ingredients, allCounts, dayMovements);
      const flagged = rows.filter(isFlagged);
      const valueImpact = flagged.reduce(
        (s, r) => s + Math.abs(r.discrepancy!) * (costByIngredient.get(r.ingredientId) ?? 0),
        0
      );
      return { date: d, flaggedCount: flagged.length, valueImpact, countedIngredients: rows.filter((r) => r.actualCounted !== null).length };
    });
  }, [ingredients, allCounts, rangeMovements, weekDates, costByIngredient]);

  function handleExportDay() {
    if (dayRows.length === 0) return;
    const rows: (string | number)[][] = [
      [
        "Ingredient",
        "Unit",
        "Starting Stock",
        "Sold",
        "Restocked",
        "Wasted",
        "Expected (Starting - Sold)",
        "Actual Count",
        "Discrepancy",
      ],
      ...dayRows.map((r) => [
        r.ingredientName,
        r.unit,
        r.startingStock ?? "",
        r.sold,
        r.restocked,
        r.wasted,
        r.expected ?? "",
        r.actualCounted ?? "",
        r.discrepancy ?? "",
      ]),
    ];
    downloadCsv(`stock-reconciliation-${date}.csv`, rows);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex gap-1.5">
          {(["day", "week"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                mode === m
                  ? "bg-coffee-900 text-cream-50 border-coffee-900"
                  : "border-coffee-200 text-coffee-700"
              }`}
            >
              {m === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
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
        {mode === "day" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={dayRows.length === 0}
            onClick={handleExportDay}
            className="ml-auto"
          >
            Export CSV
          </Button>
        )}
      </Card>

      <p className="text-xs text-coffee-400 px-1">
        Expected stock is each ingredient's beginning-of-day figure minus what sold that day.
        Comparing that to the stockman's actual count surfaces stock that isn't accounted for by
        sales alone. Restocked/wasted are shown for context — a discrepancy that lines up with
        logged waste usually isn't the one to chase.
      </p>

      {mode === "day" ? (
        <>
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 text-xs font-medium text-coffee-600">
              <input
                type="checkbox"
                checked={onlyDiscrepancies}
                onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              Only show discrepancies ({flaggedCount})
            </label>
          </div>

          {visibleDayRows.length === 0 ? (
            <EmptyState
              text={
                onlyDiscrepancies
                  ? "No discrepancies found for this day."
                  : "No ingredients to show."
              }
            />
          ) : (
            <Card className="divide-y divide-coffee-100">
              {visibleDayRows.map((r) => {
                const flagged = isFlagged(r);
                return (
                  <div key={r.ingredientId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-coffee-900">
                        {r.ingredientName}
                      </div>
                      {flagged ? (
                        <Badge tone={r.discrepancy! < 0 ? "danger" : "warning"}>
                          {r.discrepancy! > 0 ? "+" : ""}
                          {r.discrepancy} {r.unit}
                        </Badge>
                      ) : r.expected !== null && r.actualCounted !== null ? (
                        <Badge tone="success">Matches</Badge>
                      ) : (
                        <Badge>No count</Badge>
                      )}
                    </div>
                    <div className="text-xs text-coffee-400 mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5">
                      <span>
                        Start: {r.startingStock === null ? "—" : `${r.startingStock} ${r.unit}`}
                      </span>
                      <span>
                        Sold: {r.sold} {r.unit}
                      </span>
                      <span>
                        Expected: {r.expected === null ? "—" : `${r.expected} ${r.unit}`}
                      </span>
                      <span>
                        Actual: {r.actualCounted === null ? "—" : `${r.actualCounted} ${r.unit}`}
                      </span>
                      {r.restocked > 0 && (
                        <span>
                          Restocked: {r.restocked} {r.unit}
                        </span>
                      )}
                      {r.wasted > 0 && (
                        <span>
                          Wasted: {r.wasted} {r.unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      ) : (
        <Card className="divide-y divide-coffee-100">
          {weekSummary.map((d) => (
            <button
              key={d.date}
              onClick={() => {
                setDate(d.date);
                setMode("day");
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-coffee-50"
            >
              <div>
                <div className="text-sm font-semibold text-coffee-900">
                  {format(new Date(d.date + "T00:00:00"), "EEE, MMM d")}
                </div>
                <div className="text-xs text-coffee-400">
                  {d.countedIngredients} ingredient(s) counted
                </div>
              </div>
              <div className="text-right shrink-0">
                {d.flaggedCount === 0 ? (
                  <Badge tone="success">No discrepancies</Badge>
                ) : (
                  <>
                    <Badge tone="danger">
                      {d.flaggedCount} discrepanc{d.flaggedCount === 1 ? "y" : "ies"}
                    </Badge>
                    <div className="text-xs text-coffee-400 mt-1">
                      ~{formatMoney(d.valueImpact, symbol)} impact
                    </div>
                  </>
                )}
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
