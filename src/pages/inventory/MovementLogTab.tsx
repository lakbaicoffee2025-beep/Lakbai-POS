import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { useAuthStore } from "../../store/authStore";
import { downloadCsv } from "../../lib/csvExport";
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

export default function MovementLogTab() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const isAdmin = currentUser.role === "admin";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const hasRange = !!from && !!to;

  const movements = useLiveQuery(() => {
    if (hasRange) {
      const fromTs = new Date(from + "T00:00:00").getTime();
      const toTs = new Date(to + "T23:59:59.999").getTime();
      return db.inventoryMovements
        .where("createdAt")
        .between(fromTs, toTs, true, true)
        .reverse()
        .sortBy("createdAt");
    }
    return db.inventoryMovements.orderBy("createdAt").reverse().limit(RECENT_LIMIT).toArray();
  }, [hasRange, from, to]);

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
    const suffix = hasRange ? `${from}_to_${to}` : "recent";
    downloadCsv(`stock-movements-${suffix}.csv`, rows);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-coffee-400 mb-1 block">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-coffee-400 mb-1 block">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {hasRange && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
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

      {!hasRange && (
        <p className="text-xs text-coffee-400 px-1">
          Showing the {RECENT_LIMIT} most recent movements. Set a From/To range above to see
          more or export a specific period.
        </p>
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
