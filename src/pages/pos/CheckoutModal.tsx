import { useState } from "react";
import { useCartStore } from "../../store/cartStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { computeOrderTotals } from "../../lib/cartMath";
import { formatMoney } from "../../lib/format";
import { Modal, Button } from "../../components/ui";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { nextOrderNo } from "../../db/counters";
import { deductInventoryForOrder, cartLineIngredientUsage } from "../../db/inventory";
import type { Order, Payment, PaymentMethod } from "../../types";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashTenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = method === "cash" ? Math.max(0, cashTenderedNum - totals.total) : 0;

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

      const orderNo = await nextOrderNo();
      const order: Order = {
        id: newId(),
        orderNo,
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
        if (!product) return;
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

      await db.orders.add(order);
      if (usage.size > 0) {
        await deductInventoryForOrder(usage, order.id, currentUser.id, currentUser.name);
      }

      clearCart();
      onComplete(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete sale");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Checkout">
      <div className="space-y-4">
        <div className="text-center py-2">
          <div className="text-xs text-coffee-400">Amount Due</div>
          <div className="text-3xl font-bold text-coffee-900">
            {formatMoney(totals.total, symbol)}
          </div>
        </div>

        <div className="flex gap-2">
          {(["cash", "gcash", "split"] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize border ${
                method === m
                  ? "bg-coffee-900 text-cream-50 border-coffee-900"
                  : "border-coffee-200 text-coffee-700"
              }`}
            >
              {m === "gcash" ? "GCash" : m}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <div>
            <label className="text-xs font-medium text-coffee-500 mb-1 block">
              Cash Tendered
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={cashTendered}
              onChange={(e) => setCashTendered(e.target.value)}
              className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <div className="flex justify-between text-sm mt-2 text-coffee-600">
              <span>Change Due</span>
              <span className="font-semibold">{formatMoney(changeDue, symbol)}</span>
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
                className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-coffee-500 mb-1 block">
                Reference No. (optional)
              </label>
              <input
                value={gcashRef}
                onChange={(e) => setGcashRef(e.target.value)}
                className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
                className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
                className="w-full rounded-lg border border-coffee-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
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
