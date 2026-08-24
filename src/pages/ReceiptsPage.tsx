import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { useSettingsStore } from "../store/settingsStore";
import { useDarkModeStore } from "../store/darkModeStore";
import { formatMoney } from "../lib/format";
import type { Order } from "../types";
import { PageHeader, Card, Input, Badge, EmptyState } from "../components/ui";
import ReceiptDetailModal from "../components/ReceiptDetailModal";

export default function ReceiptsPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const isAdmin = currentUser.role === "admin";
  const darkMode = useDarkModeStore((s) => s.darkMode);
  const toggleDarkMode = useDarkModeStore((s) => s.toggleDarkMode);

  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  // Non-admin (cashier) only ever sees the receipts from their current
  // open shift — reviewing past shifts/dates is admin-only. With no shift
  // open there's nothing to scope to, so the list is simply empty.
  const orders = useLiveQuery(() => {
    if (isAdmin) return db.orders.orderBy("createdAt").reverse().toArray();
    if (!activeShift) return Promise.resolve<Order[]>([]);
    return db.orders.where("shiftId").equals(activeShift.id).reverse().sortBy("createdAt");
  }, [isAdmin, activeShift?.id]);

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
    <div className={`bg-cream-50 dark:bg-coffee-950 min-h-full ${darkMode ? "dark" : ""}`}>
      <PageHeader
        title="Receipts"
        subtitle={
          isAdmin
            ? "All transactions"
            : activeShift
              ? "This shift's transactions"
              : "Open a shift to see its transactions"
        }
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

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Search by customer, cashier, or order #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          {isAdmin && (
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-auto"
            />
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            text={
              query || dateFilter
                ? "No receipts match."
                : isAdmin
                  ? "No transactions yet."
                  : activeShift
                    ? "No transactions yet this shift."
                    : "Open a shift to see its transactions here. Past shifts and other dates are visible to Admin only."
            }
          />
        ) : (
          <Card className="divide-y divide-coffee-100 dark:divide-coffee-800">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => setViewOrder(o)}
                className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-coffee-50 dark:hover:bg-coffee-800"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900 dark:text-cream-50 flex items-center gap-2">
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
                <div className="text-sm font-bold text-coffee-900 dark:text-cream-50 shrink-0">
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
