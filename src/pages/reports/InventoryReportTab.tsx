import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { Card, Badge, EmptyState } from "../../components/ui";

export default function InventoryReportTab() {
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const valuation = (ingredients ?? []).reduce((s, i) => s + i.stockQty * i.costPerUnit, 0);
  const lowStock = (ingredients ?? []).filter((i) => i.stockQty <= i.reorderLevel);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="rounded-lg border border-coffee-100 bg-white p-4 flex items-center justify-between">
        <span className="text-sm text-coffee-500">Inventory Valuation</span>
        <span className="text-xl font-bold text-coffee-900">
          {formatMoney(valuation, symbol)}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2">
          Low Stock ({lowStock.length})
        </h3>
        {lowStock.length === 0 ? (
          <EmptyState text="All ingredients are sufficiently stocked." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {lowStock.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-coffee-900">{i.name}</div>
                  <div className="text-xs text-coffee-400">
                    {i.stockQty} {i.unit} on hand (reorder at {i.reorderLevel})
                  </div>
                </div>
                <Badge tone="danger">Reorder</Badge>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
