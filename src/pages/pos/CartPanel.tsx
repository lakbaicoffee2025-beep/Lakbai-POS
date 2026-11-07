import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { useCartStore } from "../../store/cartStore";
import { formatMoney } from "../../lib/format";
import { computeOrderTotals } from "../../lib/cartMath";
import { useSettingsStore } from "../../store/settingsStore";
import { Button, Select } from "../../components/ui";
import { MinusIcon, PlusIcon, CloseIcon } from "../../components/icons";

export default function CartPanel({
  onCheckout,
  onHoldTicket,
}: {
  onCheckout: () => void;
  onHoldTicket?: () => void;
}) {
  const lines = useCartStore((s) => s.lines);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQty = useCartStore((s) => s.updateQty);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const setOrderDiscount = useCartStore((s) => s.setOrderDiscount);
  const clearCart = useCartStore((s) => s.clearCart);

  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings?.currencySymbol ?? "₱";
  const discountsEnabled = settings?.discountsEnabled ?? true;
  const discounts = useLiveQuery(
    () => db.discounts.filter((d) => d.active).toArray(),
    []
  );

  const taxRate = settings?.taxRate ?? 0;
  const taxInclusive = settings?.taxInclusive ?? true;
  const { subtotal, discountTotal, taxTotal, total } = computeOrderTotals(
    lines,
    orderDiscount,
    taxRate,
    taxInclusive
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-coffee-900">
      <div className="px-4 py-2.5 border-b border-coffee-100 flex items-center justify-between shrink-0 dark:border-coffee-800">
        <h2 className="font-display text-lg text-coffee-900 dark:text-cream-50">
          Current Order{" "}
          <span className="font-sans text-sm font-normal text-coffee-400">({lines.length})</span>
        </h2>
        {lines.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-red-600 font-medium"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {lines.length === 0 && (
          <div className="text-center py-10 text-coffee-400 text-sm">
            Cart is empty. Tap a product to add.
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className="border-b border-coffee-50 dark:border-coffee-800 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-coffee-900 truncate dark:text-cream-50">
                  {line.productName}
                  {line.variantName ? ` (${line.variantName})` : ""}
                </div>
                {line.modifiers.length > 0 && (
                  <div className="text-xs text-coffee-400 truncate">
                    {line.modifiers.map((m) => m.optionName).join(", ")}
                  </div>
                )}
                {line.notes && (
                  <div className="text-xs text-coffee-400 italic truncate">
                    "{line.notes}"
                  </div>
                )}
              </div>
              <button
                onClick={() => removeLine(line.id)}
                className="text-coffee-300 hover:text-red-500 shrink-0"
                aria-label="Remove"
              >
                <CloseIcon size={13} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateQty(line.id, Math.max(1, line.qty - 1))}
                  aria-label="Decrease quantity"
                  className="w-6 h-6 rounded-full bg-coffee-100 text-coffee-800 flex items-center justify-center dark:bg-coffee-800 dark:text-cream-100"
                >
                  <MinusIcon size={11} strokeWidth={2.5} />
                </button>
                <span className="w-5 text-center text-sm font-semibold dark:text-cream-50">
                  {line.qty}
                </span>
                <button
                  onClick={() => updateQty(line.id, line.qty + 1)}
                  aria-label="Increase quantity"
                  className="w-6 h-6 rounded-full bg-coffee-100 text-coffee-800 flex items-center justify-center dark:bg-coffee-800 dark:text-cream-100"
                >
                  <PlusIcon size={11} strokeWidth={2.5} />
                </button>
              </div>
              {discountsEnabled && (
                <select
                  value={line.discount?.id ?? ""}
                  onChange={(e) => {
                    const d = (discounts ?? []).find((d) => d.id === e.target.value);
                    setLineDiscount(
                      line.id,
                      d ? { id: d.id, name: d.name, type: d.type, value: d.value } : undefined
                    );
                  }}
                  className="text-xs border border-coffee-200 rounded-md px-1.5 py-1 text-coffee-600 min-w-0 flex-1 max-w-[120px] dark:border-coffee-700 dark:bg-coffee-800 dark:text-coffee-200"
                >
                  <option value="">No discount</option>
                  {(discounts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="tabnum text-sm font-bold text-coffee-900 shrink-0 dark:text-cream-50">
                {formatMoney(line.lineTotal, symbol)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-coffee-100 dark:border-coffee-800 p-3.5 space-y-2 shrink-0">
        {discountsEnabled && (
          <div>
            <label className="text-xs font-medium text-coffee-500 mb-1 block">
              Order Discount
            </label>
            <Select
              value={orderDiscount?.id ?? ""}
              onChange={(e) => {
                const d = (discounts ?? []).find((d) => d.id === e.target.value);
                setOrderDiscount(
                  d ? { id: d.id, name: d.name, type: d.type, value: d.value } : null
                );
              }}
            >
              <option value="">No discount</option>
              {(discounts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type === "percent" ? `${d.value}%` : formatMoney(d.value, symbol)})
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="text-sm space-y-1 pt-0.5">
          <div className="flex justify-between text-coffee-600 dark:text-coffee-300">
            <span>Subtotal</span>
            <span className="tabnum">{formatMoney(subtotal, symbol)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-sage-700 font-medium dark:text-sage-600">
              <span>Discount</span>
              <span className="tabnum">-{formatMoney(discountTotal, symbol)}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-coffee-600 dark:text-coffee-300">
              <span>Tax ({taxRate}%{taxInclusive ? ", incl." : ""})</span>
              <span className="tabnum">{formatMoney(taxTotal, symbol)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-coffee-900 dark:text-cream-50 pt-1">
            <span className="font-display text-base">Total</span>
            <span className="tabnum">{formatMoney(total, symbol)}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-1">
          {onHoldTicket && (
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={lines.length === 0}
              onClick={onHoldTicket}
            >
              Hold
            </Button>
          )}
          <Button
            className="flex-[2] tabnum"
            size="lg"
            disabled={lines.length === 0}
            onClick={onCheckout}
          >
            Charge {formatMoney(total, symbol)}
          </Button>
        </div>
      </div>
    </div>
  );
}
