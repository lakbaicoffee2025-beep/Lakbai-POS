import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { formatMoney } from "../lib/format";
import type { Order } from "../types";
import { PageHeader, Card, Input, Badge, EmptyState } from "../components/ui";
import ReceiptDetailModal from "../components/ReceiptDetailModal";

export default function ReceiptsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const isAdmin = currentUser.role === "admin";

  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  const orders = useLiveQuery(
    () =>
      (isAdmin
        ? db.orders.orderBy("createdAt").reverse().toArray()
        : db.orders
            .where("cashierId")
            .equals(currentUser.id)
            .reverse()
            .sortBy("createdAt")),
    [isAdmin, currentUser.id]
  );

  const filtered = (orders ?? []).filter((o) => {
    if (dateFilter && format(o.createdAt, "yyyy-MM-dd") !== dateFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(o.orderNo).includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.cashierName.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle={isAdmin ? "All transactions" : "Your transactions"}
      />

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Search by customer, cashier, or order #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-auto"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState text={query || dateFilter ? "No receipts match." : "No transactions yet."} />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => setViewOrder(o)}
                className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-coffee-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                    Order #{o.orderNo}
                    {o.status === "voided" && <Badge tone="danger">Voided</Badge>}
                    {o.status === "refunded" && <Badge tone="warning">Refunded</Badge>}
                    {o.status === "completed" && (o.refunds?.length ?? 0) > 0 && (
                      <Badge tone="warning">Partial Refund</Badge>
                    )}
                  </div>
                  <div className="text-xs text-coffee-400 truncate">
                    {format(o.createdAt, "MMM d, h:mm a")}
                    {o.customerName ? ` · ${o.customerName}` : ""}
                    {isAdmin ? ` · ${o.cashierName}` : ""}
                  </div>
                </div>
                <div className="text-sm font-bold text-coffee-900 shrink-0">
                  {formatMoney(o.total, symbol)}
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>

      {viewOrder && (
        <ReceiptDetailModal order={viewOrder} onClose={() => setViewOrder(null)} />
      )}
    </div>
  );
}
