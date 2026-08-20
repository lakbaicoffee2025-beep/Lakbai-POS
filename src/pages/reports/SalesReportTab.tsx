import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { refundedQtyForLine, orderRefundedTotal, orderRefundedCashGcash } from "../../lib/refundMath";
import { Card, Input, EmptyState } from "../../components/ui";

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function SalesReportTab() {
  const [date, setDate] = useState(todayStr());
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const dayStart = new Date(date + "T00:00:00").getTime();
  const dayEnd = new Date(date + "T23:59:59.999").getTime();

  const orders = useLiveQuery(
    () =>
      db.orders
        .where("createdAt")
        .between(dayStart, dayEnd, true, true)
        .filter((o) => o.status === "completed")
        .toArray(),
    [dayStart, dayEnd]
  );

  const gross = (orders ?? []).reduce((s, o) => s + o.subtotal, 0);
  const discount = (orders ?? []).reduce((s, o) => s + o.discountTotal, 0);
  const tax = (orders ?? []).reduce((s, o) => s + o.taxTotal, 0);
  const refunded = (orders ?? []).reduce((s, o) => s + orderRefundedTotal(o), 0);
  const net = (orders ?? []).reduce((s, o) => s + o.total - orderRefundedTotal(o), 0);
  const cash = (orders ?? []).reduce((s, o) => s + o.payment.cashAmount - orderRefundedCashGcash(o).cash, 0);
  const gcash = (orders ?? []).reduce((s, o) => s + o.payment.gcashAmount - orderRefundedCashGcash(o).gcash, 0);

  const productTotals = new Map<string, { name: string; qty: number; total: number }>();
  for (const o of orders ?? []) {
    for (const item of o.items) {
      const netQty = item.qty - refundedQtyForLine(o, item.id);
      if (netQty <= 0) continue;
      const netLineTotal = (item.lineTotal / item.qty) * netQty;
      const key = item.productId + (item.variantId ?? "");
      const existing = productTotals.get(key);
      const label = item.productName + (item.variantName ? ` (${item.variantName})` : "");
      if (existing) {
        existing.qty += netQty;
        existing.total += netLineTotal;
      } else {
        productTotals.set(key, { name: label, qty: netQty, total: netLineTotal });
      }
    }
  }
  const topProducts = Array.from(productTotals.values()).sort((a, b) => b.qty - a.qty);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Orders" value={String(orders?.length ?? 0)} />
        <Stat label="Net Sales" value={formatMoney(net, symbol)} />
        <Stat label="Gross Sales" value={formatMoney(gross, symbol)} />
        <Stat label="Discounts" value={formatMoney(discount, symbol)} />
        <Stat label="Tax Collected" value={formatMoney(tax, symbol)} />
        <Stat label="Refunds" value={formatMoney(refunded, symbol)} />
        <Stat label="Cash / GCash" value={`${formatMoney(cash, symbol)} / ${formatMoney(gcash, symbol)}`} />
      </div>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2">Product Sales</h3>
        {topProducts.length === 0 ? (
          <EmptyState text="No sales for this date." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {topProducts.map((p) => (
              <div key={p.name} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-coffee-700">
                  {p.qty}x {p.name}
                </span>
                <span className="font-semibold text-coffee-900">
                  {formatMoney(p.total, symbol)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-coffee-100 bg-white p-3">
      <div className="text-xs text-coffee-400">{label}</div>
      <div className="text-base font-bold text-coffee-900">{value}</div>
    </div>
  );
}
