import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

interface HourBucket {
  hourStart: number;
  label: string;
  sales: number;
}

/**
 * One bucket per clock hour from the shift's start hour through its end hour
 * (or the current hour if still open), 0-filled for any hour with no sales —
 * so a quiet hour in the middle of a shift still shows up as a gap, not a
 * missing bar.
 */
function hourlyBuckets(shiftStart: number, shiftEnd: number, orders: Order[]): HourBucket[] {
  const firstHour = new Date(shiftStart);
  firstHour.setMinutes(0, 0, 0);
  const lastHour = new Date(shiftEnd);
  lastHour.setMinutes(0, 0, 0);

  const buckets: HourBucket[] = [];
  let prevDay = "";
  for (let t = firstHour.getTime(); t <= lastHour.getTime(); t += 60 * 60 * 1000) {
    const d = new Date(t);
    const day = format(d, "MMM d");
    const label = day === prevDay ? format(d, "h a") : format(d, "MMM d, h a");
    prevDay = day;
    buckets.push({ hourStart: t, label, sales: 0 });
  }

  for (const o of orders) {
    const bucket = buckets.find(
      (b) => o.createdAt >= b.hourStart && o.createdAt < b.hourStart + 60 * 60 * 1000
    );
    if (bucket) bucket.sales += o.total - orderRefundedTotal(o);
  }

  return buckets;
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

type StatsRangePreset = "today" | "7d" | "30d" | "custom";

export default function DashboardPage() {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  // ---- Main stats, selectable date/range ----
  const [statsPreset, setStatsPreset] = useState<StatsRangePreset>("today");
  const [statsFrom, setStatsFrom] = useState(todayStr());
  const [statsTo, setStatsTo] = useState(todayStr());

  const [statsStart, statsEnd] = useMemo(() => {
    if (statsPreset === "today") return dayBounds(todayStr());
    if (statsPreset === "7d") return dayBounds2(subDays(new Date(), 6), new Date());
    if (statsPreset === "30d") return dayBounds2(subDays(new Date(), 29), new Date());
    return [dayBounds(statsFrom)[0], dayBounds(statsTo)[1]];
  }, [statsPreset, statsFrom, statsTo]);

  const statsOrders = useLiveQuery(
    () =>
      db.orders
        .where("createdAt")
        .between(statsStart, statsEnd, true, true)
        .filter((o) => o.status === "completed")
        .toArray(),
    [statsStart, statsEnd]
  );

  const orders = statsOrders ?? [];
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
    () => aggregateProducts(statsOrders ?? []).sort((a, b) => b.qty - a.qty).slice(0, 5),
    [statsOrders]
  );

  const statsLabel =
    statsPreset === "today"
      ? `Today · ${format(new Date(), "MMM d, yyyy")}`
      : statsPreset === "7d"
        ? "Last 7 Days"
        : statsPreset === "30d"
          ? "Last 30 Days"
          : `${format(new Date(statsFrom + "T00:00:00"), "MMM d, yyyy")} – ${format(new Date(statsTo + "T00:00:00"), "MMM d, yyyy")}`;

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

  // ---- Per-shift breakdown: products sold + hourly sales ----
  const allShifts = useLiveQuery(
    () => db.shifts.orderBy("startedAt").reverse().toArray(),
    []
  );
  const allProducts = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [shiftCategoryFilter, setShiftCategoryFilter] = useState("all");

  const selectedShift = (allShifts ?? []).find((s) => s.id === selectedShiftId);

  const shiftOrders = useLiveQuery(
    () =>
      selectedShiftId
        ? db.orders
            .where("shiftId")
            .equals(selectedShiftId)
            .filter((o) => o.status !== "voided")
            .toArray()
        : Promise.resolve<Order[]>([]),
    [selectedShiftId]
  );

  const categoryNameByProductId = useMemo(() => {
    const productCatId = new Map((allProducts ?? []).map((p) => [p.id, p.categoryId]));
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const map = new Map<string, string>();
    for (const [productId, catId] of productCatId) {
      map.set(productId, catName.get(catId) ?? "Uncategorized");
    }
    return map;
  }, [allProducts, categories]);

  const shiftProductAgg = useMemo(
    () => aggregateProducts(shiftOrders ?? []).sort((a, b) => b.qty - a.qty),
    [shiftOrders]
  );

  const shiftCategoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of shiftProductAgg) {
      const cat = categoryNameByProductId.get(p.productId) ?? "Uncategorized";
      totals.set(cat, (totals.get(cat) ?? 0) + p.qty);
    }
    return Array.from(totals.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [shiftProductAgg, categoryNameByProductId]);

  const shiftProductsFiltered =
    shiftCategoryFilter === "all"
      ? shiftProductAgg
      : shiftProductAgg.filter(
          (p) => (categoryNameByProductId.get(p.productId) ?? "Uncategorized") === shiftCategoryFilter
        );

  const hourlyChartData = useMemo(() => {
    if (!selectedShift) return [];
    return hourlyBuckets(
      selectedShift.startedAt,
      selectedShift.endedAt ?? Date.now(),
      shiftOrders ?? []
    );
  }, [selectedShift, shiftOrders]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live sales overview" />
      <div className="p-4 max-w-3xl mx-auto space-y-5">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <h3 className="text-sm font-bold text-coffee-800">{statsLabel}</h3>
            <div className="flex gap-1.5">
              {(["today", "7d", "30d", "custom"] as StatsRangePreset[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setStatsPreset(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    statsPreset === r
                      ? "bg-coffee-900 text-cream-50 border-coffee-900"
                      : "border-coffee-200 text-coffee-700"
                  }`}
                >
                  {r === "today" ? "Today" : r === "7d" ? "1 Week" : r === "30d" ? "1 Month" : "Custom"}
                </button>
              ))}
            </div>
          </div>
          {statsPreset === "custom" && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-xs text-coffee-400 mb-1 block">From</label>
                <input
                  type="date"
                  value={statsFrom}
                  onChange={(e) => setStatsFrom(e.target.value)}
                  className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-coffee-400 mb-1 block">To</label>
                <input
                  type="date"
                  value={statsTo}
                  onChange={(e) => setStatsTo(e.target.value)}
                  className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Orders" value={String(orderCount)} />
            <Stat label="Net Sales" value={formatMoney(netSales, symbol)} />
            <Stat label="Cash" value={formatMoney(cash, symbol)} />
            <Stat label="GCash" value={formatMoney(gcash, symbol)} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">Top 5 Products</h3>
          {top5.length === 0 ? (
            <EmptyState text="No sales in this range." />
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

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2">Shift Sales Breakdown</h3>
          <Card className="p-4 space-y-4">
            <div>
              <label className="text-xs text-coffee-400 mb-1 block">Shift</label>
              <Select
                value={selectedShiftId}
                onChange={(e) => {
                  setSelectedShiftId(e.target.value);
                  setShiftCategoryFilter("all");
                }}
              >
                <option value="">Select a shift…</option>
                {(allShifts ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.cashierName} · {format(s.startedAt, "MMM d, h:mm a")}
                    {s.status === "open" ? " (Ongoing)" : ""}
                  </option>
                ))}
              </Select>
            </div>

            {!selectedShift ? (
              <p className="text-xs text-coffee-400">
                Pick a shift to see the products sold, category breakdown, and hourly sales for
                it.
              </p>
            ) : (
              <>
                <div>
                  <div className="text-xs font-semibold text-coffee-500 mb-1.5">By Category</div>
                  {shiftCategoryTotals.length === 0 ? (
                    <p className="text-xs text-coffee-400">No sales this shift.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setShiftCategoryFilter("all")}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          shiftCategoryFilter === "all"
                            ? "bg-coffee-900 text-cream-50 border-coffee-900"
                            : "border-coffee-200 text-coffee-700"
                        }`}
                      >
                        All ({shiftProductAgg.reduce((s, p) => s + p.qty, 0)})
                      </button>
                      {shiftCategoryTotals.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => setShiftCategoryFilter(c.name)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            shiftCategoryFilter === c.name
                              ? "bg-coffee-900 text-cream-50 border-coffee-900"
                              : "border-coffee-200 text-coffee-700"
                          }`}
                        >
                          {c.name} ({c.qty})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-coffee-500 mb-1.5">
                    Products Sold{shiftCategoryFilter !== "all" ? ` · ${shiftCategoryFilter}` : ""}
                  </div>
                  {shiftProductsFiltered.length === 0 ? (
                    <EmptyState text="No products sold in this category." />
                  ) : (
                    <div className="rounded-lg border border-coffee-100 divide-y divide-coffee-100">
                      {shiftProductsFiltered.map((p) => (
                        <div
                          key={p.productId}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <span className="text-coffee-700 truncate">{p.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-coffee-500">{p.qty}x</span>
                            <span className="font-semibold text-coffee-900">
                              {formatMoney(p.revenue, symbol)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-coffee-500 mb-1.5">Hourly Sales</div>
                  {hourlyChartData.length === 0 ? (
                    <p className="text-xs text-coffee-400">No hours to show yet.</p>
                  ) : (
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer>
                        <BarChart data={hourlyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="#f0e4d5" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#b98652" }}
                            axisLine={{ stroke: "#e0c8ab" }}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "#b98652" }}
                            axisLine={false}
                            tickLine={false}
                            width={44}
                            tickFormatter={(v: number) => v.toLocaleString()}
                          />
                          <Tooltip
                            cursor={{ fill: "#f0e4d5" }}
                            contentStyle={{
                              border: "1px solid #e0c8ab",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(v) => [formatMoney(Number(v) || 0, symbol), "Sales"]}
                          />
                          <Bar dataKey="sales" fill="#d97b3f" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
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
