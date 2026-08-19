import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { Card, Badge, EmptyState } from "../../components/ui";
import type { InventoryMovementType } from "../../types";

const TYPE_LABEL: Record<InventoryMovementType, string> = {
  sale: "Sale",
  purchase_receive: "PO Received",
  adjustment_in: "Stock In",
  adjustment_out: "Stock Out",
  waste: "Waste",
};

export default function MovementLogTab() {
  const movements = useLiveQuery(
    () => db.inventoryMovements.orderBy("createdAt").reverse().limit(100).toArray(),
    []
  );

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      {!movements || movements.length === 0 ? (
        <EmptyState text="No inventory movements yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-coffee-900">
                  {m.ingredientName}
                </div>
                <div className="text-xs text-coffee-400">
                  {format(m.createdAt, "MMM d, h:mm a")} · {m.createdByName}
                  {m.note ? ` · ${m.note}` : ""}
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
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
