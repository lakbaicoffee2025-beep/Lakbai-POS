import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays } from "date-fns";
import { db } from "../db/db";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { refundedQtyForLine, orderRefundedTotal, orderRefundedCashGcash } from "../lib/refundMath";
import { PageHeader, Card, Select, EmptyState } from "../components/ui";
import type { Order } from "../types";

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function dayBounds(dateStr: string): [number, number] {
  return [
    new Date(dateStr + "T00:00:00").getTime(),
    new Date(dateStr + "T23:59:59.999").getTime(),
  ];
}

interface ProductAgg {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

function aggregateProducts(orders: Order[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const o of orders) {
    for (const item of o.items) {
      const netQty = item.qty - refundedQtyForLine(o, item.id);
      if (netQty <= 0) continue;
      const netRevenue = (item.lineTotal / item.qty) * netQty;
      const existing = map.get(item.productId);
      if (existing) {
        existing.qty += netQty;
        existing.revenue += netRevenue;
      } else {
        map.set(item.productId, {
          productId: item.productId,
          name: item.productName,
          qty: netQty,
          revenue: netRevenue,
        });
      }
    }
  }
  return Array.from(map.values());
}

type RangePreset = "7d" | "30d" | "custom";

export default function DashboardPage() {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  // ---- Today, real-time ----
  const [todayStart, todayEnd] = dayBounds(todayStr());
  const todayOrders = useLiveQuery(
    () =>
      db.orders
        .where("createdAt")
        .between(todayStart, todayEnd, true, true)
        .filter((o) => o.status === "completed")
        .toArray(),
    [todayStart, todayEnd]
  );

  const orders = todayOrders ?? [];
  const orderCount = orders.length;
  const netSales = orders.reduce((s, o) => s + o.total - orderRefundedTotal(o), 0);
  const cash = orders.reduce((s, o) => {
    const refunded = orderRefundedCashGcash(o);
    return s + o.payment.cashAmount - refunded.cash;
  }, 0);
  const gcash = orders.reduce((s, o) => {
    const refunded = orderRefundedCashGcash(o);
    return s + o.payment.gcashAmount - refunded.gcash;
  }, 0);

  const top5 = useMemo(
    () => aggregateProducts(todayOrders ?? []).sort((a, b) => b.qty - a.qty).slice(0, 5),
    [todayOrders]
  );

  // ---- Product sales lookup, ranged ----
  const products = useLiveQuery(
    () =>
      db.products
        .filter((p) => p.active)
        .toArray()
        .then((list) => list.sort((a, b) => a.name.localeCompare(b.name))),
    []
  );

  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(todayStr());
  const [productId, setProductId] = useState<string>("");

  const [rangeStart, rangeEnd] = useMemo(() => {
    if (preset === "7d") return dayBounds2(subDays(new Date(), 6), new Date());
    if (preset === "30d") return dayBounds2(subDays(new Date(), 29), new Date());
    return [dayBounds(customFrom)[0], dayBounds(customTo)[1]];
  }, [preset, customFrom, customTo]);

  const rangeOrders = useLiveQuery(
    () =>
      db.orders
        .where("createdAt")
        .between(rangeStart, rangeEnd, true, true)
        .filter((o) => o.status === "completed")
        .toArray(),
    [rangeStart, rangeEnd]
  );

  const rangeAgg = useMemo(() => {
    const all = aggregateProducts(rangeOrders ?? []);
    if (!productId) return null;
    return all.find((p) => p.productId === productId) ?? { productId, name: "", qty: 0, revenue: 0 };
  }, [rangeOrders, productId]);

  const selectedProduct = (products ?? []).find((p) => p.id === productId);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live sales overview" />
      <div className="p-4 max-w-3xl mx-auto space-y-5">
        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">
            Today · {format(new Date(), "MMM d, yyyy")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Orders" value={String(orderCount)} />
            <Stat label="Net Sales" value={formatMoney(netSales, symbol)} />
            <Stat label="Cash" value={formatMoney(cash, symbol)} />
            <Stat label="GCash" value={formatMoney(gcash, symbol)} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">Top 5 Products Today</h3>
          {top5.length === 0 ? (
            <EmptyState text="No sales yet today." />
          ) : (
            <Card className="divide-y divide-coffee-100">
              {top5.map((p, i) => (
                <div key={p.productId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-coffee-400 font-semibold w-4 shrink-0">{i + 1}</span>
                    <span className="text-coffee-700 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-coffee-500">{p.qty}x</span>
                    <span className="font-semibold text-coffee-900">
                      {formatMoney(p.revenue, symbol)}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">Product Sales by Range</h3>
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-xs text-coffee-400 mb-1 block">Product</label>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Select a product…</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs text-coffee-400 mb-1 block">Range</label>
              <div className="flex gap-2">
                {(["7d", "30d", "custom"] as RangePreset[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setPreset(r)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                      preset === r
                        ? "bg-coffee-900 text-cream-50 border-coffee-900"
                        : "border-coffee-200 text-coffee-700"
                    }`}
                  >
                    {r === "7d" ? "1 Week" : r === "30d" ? "1 Month" : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {preset === "custom" && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-coffee-400 mb-1 block">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-coffee-400 mb-1 block">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>
            )}

            {productId && rangeAgg && (
              <div className="pt-2 border-t border-coffee-100 flex items-center justify-between">
                <div className="text-sm text-coffee-600 truncate">
                  {selectedProduct?.name ?? rangeAgg.name}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-coffee-900">{rangeAgg.qty} sold</div>
                  <div className="text-xs text-coffee-400">
                    {formatMoney(rangeAgg.revenue, symbol)} revenue
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function dayBounds2(from: Date, to: Date): [number, number] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return [start.getTime(), end.getTime()];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-coffee-100 bg-white p-3">
      <div className="text-xs text-coffee-400">{label}</div>
      <div className="text-base font-bold text-coffee-900">{value}</div>
    </div>
  );
}
