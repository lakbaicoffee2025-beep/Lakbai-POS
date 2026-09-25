import { useMemo, useState } from "react";
import { useCartStore } from "../../store/cartStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { computeOrderTotals } from "../../lib/cartMath";
import { formatMoney } from "../../lib/format";
import { suggestedCashAmounts } from "../../lib/cashSuggestions";
import { Modal, Button } from "../../components/ui";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { nextOrderNo } from "../../db/counters";
import { pushTables } from "../../db/remoteSync";
import { deductInventoryForOrder, cartLineIngredientUsage } from "../../db/inventory";
import { BanknoteIcon, SmartphoneIcon, SplitIcon } from "../../components/icons";
import type { Order, Payment, PaymentMethod } from "../../types";

const METHOD_ICONS: Record<PaymentMethod, typeof BanknoteIcon> = {
  cash: BanknoteIcon,
  gcash: SmartphoneIcon,
  split: SplitIcon,
};

export default function CheckoutModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (order: Order) => void;
}) {
  const lines = useCartStore((s) => s.lines);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const clearCart = useCartStore((s) => s.clearCart);
  const resumedTicket = useCartStore((s) => s.resumedTicket);
  const settings = useSettingsStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser);
  const activeShift = useShiftStore((s) => s.activeShift);

  const symbol = settings?.currencySymbol ?? "₱";
  const taxRate = settings?.taxRate ?? 0;
  const taxInclusive = settings?.taxInclusive ?? true;
  const totals = computeOrderTotals(lines, orderDiscount, taxRate, taxInclusive);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashTendered, setCashTendered] = useState<string>(
    totals.total.toFixed(2)
  );
  const [gcashAmount, setGcashAmount] = useState<string>(totals.total.toFixed(2));
  const [splitCash, setSplitCash] = useState<string>("0");
  const [splitGcash, setSplitGcash] = useState<string>(totals.total.toFixed(2));
  const [gcashRef, setGcashRef] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashTenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = method === "cash" ? Math.max(0, cashTenderedNum - totals.total) : 0;
  const cashSuggestions = useMemo(
    () => suggestedCashAmounts(totals.total),
    [totals.total]
  );

  const splitTotal = (parseFloat(splitCash) || 0) + (parseFloat(splitGcash) || 0);
  const canSubmit =
    !submitting &&
    activeShift &&
    (method === "cash"
      ? cashTenderedNum >= totals.total
      : method === "gcash"
        ? (parseFloat(gcashAmount) || 0) >= totals.total - 0.005
        : Math.abs(splitTotal - totals.total) < 0.01);

  async function handleConfirm() {
    if (!currentUser || !activeShift) return;
    setSubmitting(true);
    setError(null);
    try {
      const payment: Payment =
        method === "cash"
          ? {
              method: "cash",
              cashAmount: totals.total,
              gcashAmount: 0,
              cashTendered: cashTenderedNum,
              changeDue,
            }
          : method === "gcash"
            ? {
                method: "gcash",
                cashAmount: 0,
                gcashAmount: totals.total,
                gcashRef: gcashRef || undefined,
              }
            : {
                method: "split",
                cashAmount: parseFloat(splitCash) || 0,
                gcashAmount: parseFloat(splitGcash) || 0,
                gcashRef: gcashRef || undefined,
              };

      const orderId = newId();
      const order: Order = {
        id: orderId,
        orderNo: 0, // set for real inside the transaction below
        shiftId: activeShift.id,
        cashierId: currentUser.id,
        cashierName: currentUser.name,
        items: lines,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        payment,
        status: "completed",
        createdAt: Date.now(),
        customerName: customerName.trim() || undefined,
      };

      // Compute ingredient usage across the whole order for stock deduction.
      const products = await db.products.bulkGet(lines.map((l) => l.productId));
      const allModifierGroups = await db.modifierGroups.toArray();
      const optionRecipeById = new Map(
        allModifierGroups.flatMap((g) => g.options.map((o) => [o.id, o.recipe]))
      );
      const usage = new Map<string, number>();
      lines.forEach((line, idx) => {
        const product = products[idx];
        if (!product || product.trackStock === false) return;
        const variant = product.variants.find((v) => v.id === line.variantId);
        const modifierRecipes = line.modifiers.map(
          (m) => optionRecipeById.get(m.optionId) ?? []
        );
        const lineUsage = cartLineIngredientUsage(
          line,
          product.recipe,
          variant?.recipe ?? [],
          modifierRecipes
        );
        for (const [ingId, qty] of lineUsage) {
          usage.set(ingId, (usage.get(ingId) ?? 0) + qty);
        }
      });

      // One atomic transaction for both the order and its stock deduction —
      // if the deduction step throws for any reason, the order write rolls
      // back too, instead of leaving a "completed" order the cashier never
      // sees confirmed (and would understandably retry, creating a
      // duplicate sale for the same cart). If this cart came from a held
      // ticket, that ticket only comes off Open Tickets here, now that the
      // sale it represents has actually gone through.
      await db.transaction(
        "rw",
        db.orders,
        db.ingredients,
        db.inventoryMovements,
        db.openTickets,
        async () => {
          order.orderNo = await nextOrderNo();
          await db.orders.add(order);
          if (usage.size > 0) {
            await deductInventoryForOrder(usage, order.id, currentUser.id, currentUser.name);
          }
          if (resumedTicket) {
            await db.openTickets.delete(resumedTicket.id);
          }
        }
      );

      clearCart();
      onComplete(order);

      // Push this sale to the server right away instead of waiting for the
      // usual debounce — a completed sale only exists on this one device
      // until it's synced, and that window is exactly when it's at risk
      // (the app's background process getting reclaimed, or someone
      // clearing this installed app's storage while troubleshooting it).
      // Fire-and-forget: the normal automatic sync still covers it if this
      // is offline or fails, this just shortens how long it's exposed.
      pushTables(["orders", "ingredients", "inventoryMovements", "openTickets"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete sale");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={submitting ? () => {} : onClose} title="Checkout">
      <div className="space-y-4">
        <div className="text-center py-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-coffee-400">Amount Due</div>
          <div className="tabnum font-display text-3xl text-accent-dark">
            {formatMoney(totals.total, symbol)}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-coffee-500 mb-1 block">
            Customer Name (optional)
          </label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Juan Dela Cruz"
            className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
          />
        </div>

        <div className="flex gap-2">
          {(["cash", "gcash", "split"] as PaymentMethod[]).map((m) => {
            const Icon = METHOD_ICONS[m];
            const selected = method === m;
            return (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize border flex items-center justify-center gap-1.5 ${
                  selected
                    ? m === "gcash"
                      ? "bg-sage-600 text-white border-sage-600"
                      : "bg-accent text-white border-accent"
                    : "border-coffee-200 text-coffee-700 dark:border-coffee-700 dark:text-coffee-200"
                }`}
              >
                <Icon size={15} />
                {m === "gcash" ? "GCash" : m}
              </button>
            );
          })}
        </div>

        {method === "cash" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-coffee-500">Suggested Amount</label>
              <span className="text-[11px] text-coffee-400">Tap, or type your own below</span>
            </div>
            <div className="flex gap-1.5 mb-3">
              {cashSuggestions.map((amt, i) => {
                const isExact = i === 0;
                const change = amt - totals.total;
                const selected = Math.abs(cashTenderedNum - amt) < 0.005;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashTendered(amt.toFixed(2))}
                    className={`flex-1 py-2 rounded-lg border flex flex-col items-center gap-0.5 ${
                      selected
                        ? "bg-accent border-accent text-white shadow-sm"
                        : "border-coffee-200 text-coffee-700 dark:border-coffee-700 dark:text-coffee-200"
                    }`}
                  >
                    <span className="tabnum text-sm font-bold">{formatMoney(amt, symbol)}</span>
                    <span
                      className={`tabnum text-[10px] font-semibold ${
                        selected ? "text-white/85" : "text-coffee-400"
                      }`}
                    >
                      {isExact ? "Exact" : `+${formatMoney(change, symbol)} chg`}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="text-xs font-medium text-coffee-500 mb-1 block">
              Cash Tendered
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={cashTendered}
              onChange={(e) => setCashTendered(e.target.value)}
              className="tabnum w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
            />
            <div className="flex justify-between text-sm mt-2 text-coffee-600 dark:text-coffee-300">
              <span>Change Due</span>
              <span className="tabnum font-semibold text-sage-700 dark:text-sage-600">{formatMoney(changeDue, symbol)}</span>
            </div>
          </div>
        )}

        {method === "gcash" && (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-coffee-500 mb-1 block">
                GCash Amount
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={gcashAmount}
                onChange={(e) => setGcashAmount(e.target.value)}
                className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-coffee-500 mb-1 block">
                Reference No. (optional)
              </label>
              <input
                value={gcashRef}
                onChange={(e) => setGcashRef(e.target.value)}
                className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
              />
            </div>
          </div>
        )}

        {method === "split" && (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-coffee-500 mb-1 block">
                Cash Amount
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={splitCash}
                onChange={(e) => setSplitCash(e.target.value)}
                className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-coffee-500 mb-1 block">
                GCash Amount
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={splitGcash}
                onChange={(e) => setSplitGcash(e.target.value)}
                className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
              />
            </div>
            <div
              className={`text-xs font-medium ${
                Math.abs(splitTotal - totals.total) < 0.01
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              Combined: {formatMoney(splitTotal, symbol)} (needs{" "}
              {formatMoney(totals.total, symbol)})
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit}
          onClick={handleConfirm}
        >
          {submitting ? "Processing…" : "Complete Sale"}
        </Button>
      </div>
    </Modal>
  );
}
