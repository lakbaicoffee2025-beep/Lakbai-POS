import type { Order } from "../../types";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { Modal, Button } from "../../components/ui";
import { format } from "date-fns";

export default function ReceiptModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings?.currencySymbol ?? "₱";

  return (
    <Modal open onClose={onClose} title="Sale Complete">
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-3xl">✅</div>
          <div className="text-lg font-bold text-coffee-900 mt-1">
            Order #{order.orderNo}
          </div>
          <div className="text-xs text-coffee-400">
            {format(order.createdAt, "MMM d, yyyy h:mm a")}
          </div>
        </div>

        <div className="border-t border-b border-dashed border-coffee-200 py-3 space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-coffee-900">
                  {item.qty}x {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ""}
                </div>
                {item.modifiers.length > 0 && (
                  <div className="text-xs text-coffee-400">
                    {item.modifiers.map((m) => m.optionName).join(", ")}
                  </div>
                )}
              </div>
              <div className="shrink-0 font-medium">
                {formatMoney(item.lineTotal, symbol)}
              </div>
            </div>
          ))}
        </div>

        <div className="text-sm space-y-1">
          <div className="flex justify-between text-coffee-600">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotal, symbol)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>-{formatMoney(order.discountTotal, symbol)}</span>
            </div>
          )}
          <div className="flex justify-between text-coffee-600">
            <span>Tax</span>
            <span>{formatMoney(order.taxTotal, symbol)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-coffee-900">
            <span>Total</span>
            <span>{formatMoney(order.total, symbol)}</span>
          </div>
          <div className="flex justify-between text-coffee-500 pt-1 capitalize">
            <span>Paid via {order.payment.method}</span>
            <span>
              {order.payment.method === "cash"
                ? `Tendered ${formatMoney(order.payment.cashTendered ?? 0, symbol)}`
                : ""}
            </span>
          </div>
          {order.payment.method === "cash" && (order.payment.changeDue ?? 0) > 0 && (
            <div className="flex justify-between font-semibold text-coffee-800">
              <span>Change</span>
              <span>{formatMoney(order.payment.changeDue ?? 0, symbol)}</span>
            </div>
          )}
        </div>

        {settings?.receiptFooter && (
          <div className="text-center text-xs text-coffee-400 pt-2">
            {settings.receiptFooter}
          </div>
        )}

        <Button className="w-full" size="lg" onClick={onClose}>
          New Order
        </Button>
      </div>
    </Modal>
  );
}
