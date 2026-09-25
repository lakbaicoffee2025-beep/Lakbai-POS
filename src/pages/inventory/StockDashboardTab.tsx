import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { useSettingsStore } from "../../store/settingsStore";
import { formatMoney } from "../../lib/format";
import { Input, EmptyState } from "../../components/ui";
import type { Ingredient } from "../../types";

type StockStatus = "ok" | "low" | "critical";

function getStatus(ing: Ingredient): StockStatus {
  if (ing.stockQty <= 0) return "critical";
  if (ing.stockQty <= ing.reorderLevel) return "low";
  return "ok";
}

const STATUS_STYLE: Record<StockStatus, { border: string; bg: string; text: string; label: string }> = {
  ok: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", label: "OK" },
  low: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", label: "Low" },
  critical: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", label: "Critical" },
};

export default function StockDashboardTab() {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const [query, setQuery] = useState("");
  const ingredients = useLiveQuery(
    () => db.ingredients.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );

  const list = ingredients ?? [];
  const filtered = list.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  const ok = list.filter((i) => getStatus(i) === "ok").length;
  const low = list.filter((i) => getStatus(i) === "low").length;
  const critical = list.filter((i) => getStatus(i) === "critical").length;
  const valuation = list.reduce((s, i) => s + i.stockQty * i.costPerUnit, 0);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Ingredients" value={String(list.length)} />
        <StatCard label="OK" value={String(ok)} tone="ok" />
        <StatCard label="Low Stock" value={String(low)} tone="low" />
        <StatCard label="Critical" value={String(critical)} tone="critical" />
      </div>

      <div className="rounded-xl border border-coffee-100 bg-white p-4 flex items-center justify-between">
        <span className="text-sm text-coffee-500">Inventory Valuation</span>
        <span className="text-xl font-bold text-coffee-900">{formatMoney(valuation, symbol)}</span>
      </div>

      <Input
        placeholder="Search ingredients…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState text={query ? "No ingredients match your search." : "No ingredients yet."} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((ing) => {
            const status = getStatus(ing);
            const style = STATUS_STYLE[status];
            return (
              <div
                key={ing.id}
                className={`rounded-xl border ${style.border} ${style.bg} p-3 text-center`}
              >
                <div className={`text-xl font-bold ${style.text}`}>
                  {ing.stockQty.toLocaleString()}
                </div>
                <div className="text-sm font-medium text-coffee-900 truncate mt-0.5">
                  {ing.name}
                </div>
                <div className="text-xs text-coffee-400">{ing.unit}</div>
                <span
                  className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${style.bg} ${style.text} border ${style.border}`}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: StockStatus;
}) {
  const style = tone ? STATUS_STYLE[tone] : null;
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        style ? `${style.border} ${style.bg}` : "border-coffee-100 bg-white"
      }`}
    >
      <div className={`text-2xl font-bold ${style ? style.text : "text-coffee-900"}`}>{value}</div>
      <div className="text-xs text-coffee-500 mt-0.5">{label}</div>
    </div>
  );
}
