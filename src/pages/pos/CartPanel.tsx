import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { useCartStore } from "../../store/cartStore";
import { formatMoney } from "../../lib/format";
import { computeOrderTotals } from "../../lib/cartMath";
import { useSettingsStore } from "../../store/settingsStore";
import { Button, Select } from "../../components/ui";

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
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="px-4 py-3 border-b border-coffee-100 flex items-center justify-between shrink-0">
        <h2 className="font-bold text-coffee-900">
          Current Order{" "}
          <span className="text-coffee-400 font-normal">({lines.length})</span>
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

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {lines.length === 0 && (
          <div className="text-center py-10 text-coffee-400 text-sm">
            Cart is empty. Tap a product to add.
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className="border-b border-coffee-50 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-coffee-900 truncate">
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
                ✕
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateQty(line.id, Math.max(1, line.qty - 1))}
                  className="w-7 h-7 rounded-full bg-coffee-100 text-coffee-800 font-bold"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-semibold">
                  {line.qty}
                </span>
                <button
                  onClick={() => updateQty(line.id, line.qty + 1)}
                  className="w-7 h-7 rounded-full bg-coffee-100 text-coffee-800 font-bold"
                >
                  +
                </button>
              </div>
              <select
                value={line.discount?.id ?? ""}
                onChange={(e) => {
                  const d = (discounts ?? []).find((d) => d.id === e.target.value);
                  setLineDiscount(
                    line.id,
                    d ? { id: d.id, name: d.name, type: d.type, value: d.value } : undefined
                  );
                }}
                className="text-xs border border-coffee-200 rounded-md px-1.5 py-1 text-coffee-600 min-w-0 flex-1 max-w-[120px]"
              >
                <option value="">No discount</option>
                {(discounts ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div className="text-sm font-bold text-coffee-900 shrink-0">
                {formatMoney(line.lineTotal, symbol)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-coffee-100 p-4 space-y-2 shrink-0">
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

        <div className="text-sm space-y-1 pt-1">
          <div className="flex justify-between text-coffee-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, symbol)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>-{formatMoney(discountTotal, symbol)}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-coffee-600">
              <span>Tax ({taxRate}%{taxInclusive ? ", incl." : ""})</span>
              <span>{formatMoney(taxTotal, symbol)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-coffee-900 pt-1">
            <span>Total</span>
            <span>{formatMoney(total, symbol)}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
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
            className="flex-[2]"
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
