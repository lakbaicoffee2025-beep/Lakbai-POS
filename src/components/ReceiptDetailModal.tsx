import { useState } from "react";
import { format } from "date-fns";
import type { Order } from "../types";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { voidOrder } from "../db/voidOrder";
import { Modal, Button, Badge } from "./ui";

export default function ReceiptDetailModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const symbol = settings?.currencySymbol ?? "₱";
  const isAdmin = currentUser.role === "admin";

  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    if (!reason.trim()) {
      setError("Enter a reason for voiding this transaction.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await voidOrder(order.id, reason.trim(), currentUser.id, currentUser.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to void order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Order #${order.orderNo}`}>
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-xs text-coffee-400">
            {format(order.createdAt, "MMM d, yyyy h:mm a")} · {order.cashierName}
          </div>
          {order.customerName && (
            <div className="text-sm text-coffee-600 mt-1">For: {order.customerName}</div>
          )}
          {order.status === "voided" && (
            <div className="mt-2">
              <Badge tone="danger">Voided</Badge>
            </div>
          )}
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
              <div className="shrink-0 font-medium">{formatMoney(item.lineTotal, symbol)}</div>
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
          <div className="text-coffee-500 capitalize pt-1">Paid via {order.payment.method}</div>
        </div>

        {order.status === "voided" && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <div className="font-semibold">
              Voided by {order.voidedByName} · {order.voidedAt ? format(order.voidedAt, "MMM d, h:mm a") : ""}
            </div>
            {order.voidReason && <div className="mt-0.5">{order.voidReason}</div>}
          </div>
        )}

        {isAdmin && order.status === "completed" && (
          <div className="pt-2 border-t border-coffee-100">
            {!voiding ? (
              <Button variant="danger" className="w-full" onClick={() => setVoiding(true)}>
                Void This Transaction
              </Button>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-coffee-500 block">
                  Reason for voiding *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Wrong order entered, customer cancelled"
                  className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}
                <p className="text-xs text-coffee-400">
                  This restores any ingredient stock the sale deducted and removes it from sales
                  totals. This can't be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setVoiding(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-[2]"
                    disabled={submitting}
                    onClick={handleVoid}
                  >
                    {submitting ? "Voiding…" : "Confirm Void"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
