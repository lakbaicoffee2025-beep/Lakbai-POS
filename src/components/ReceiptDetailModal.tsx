import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import type { CartLine, Order } from "../types";
import { formatMoney } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { voidOrder } from "../db/voidOrder";
import { deleteOrder } from "../db/deleteOrder";
import { refundOrderItem, refundableQty } from "../db/refundOrder";
import { Modal, Button, Badge } from "./ui";

export default function ReceiptDetailModal({
  order: initialOrder,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const symbol = settings?.currencySymbol ?? "₱";
  const isAdmin = currentUser.role === "admin";
  const canRefund = currentUser.role === "admin" || currentUser.role === "cashier";

  // Stay live so multiple refunds (or a void) in one sitting update in place
  // instead of needing to close and reopen the modal.
  const liveOrder = useLiveQuery(() => db.orders.get(initialOrder.id), [initialOrder.id]);
  const order = liveOrder ?? initialOrder;

  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [refundingLineId, setRefundingLineId] = useState<string | null>(null);
  const [refundQty, setRefundQty] = useState(1);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const refundedTotal = (order.refunds ?? []).reduce((s, r) => s + r.amount, 0);

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

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOrder(order.id, currentUser.id, currentUser.name);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete receipt");
      setDeleting(false);
    }
  }

  function startRefund(line: CartLine) {
    setRefundingLineId(line.id);
    setRefundQty(refundableQty(order, line.id));
    setRefundReason("");
    setRefundError(null);
  }

  async function handleRefund(line: CartLine) {
    if (!refundReason.trim()) {
      setRefundError("Enter a reason for this refund.");
      return;
    }
    setRefundSubmitting(true);
    setRefundError(null);
    try {
      await refundOrderItem(
        order.id,
        line.id,
        refundQty,
        refundReason.trim(),
        currentUser.id,
        currentUser.name
      );
      setRefundingLineId(null);
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : "Failed to refund item");
    } finally {
      setRefundSubmitting(false);
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
          {order.status === "refunded" && (
            <div className="mt-2">
              <Badge tone="warning">Fully Refunded</Badge>
            </div>
          )}
        </div>

        <div className="border-t border-b border-dashed border-coffee-200 py-3 space-y-3 text-sm">
          {order.items.map((item) => {
            const remaining = refundableQty(order, item.id);
            const refundedQty = item.qty - remaining;
            return (
              <div key={item.id}>
                <div className="flex justify-between gap-2">
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
                    {refundedQty > 0 && (
                      <div className="text-xs text-amber-600 font-medium mt-0.5">
                        {refundedQty} of {item.qty} refunded
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium">{formatMoney(item.lineTotal, symbol)}</div>
                    {canRefund && order.status === "completed" && remaining > 0 && (
                      <button
                        className="text-xs font-semibold text-accent-dark mt-0.5"
                        onClick={() => startRefund(item)}
                      >
                        Refund
                      </button>
                    )}
                  </div>
                </div>

                {refundingLineId === item.id && (
                  <div className="mt-2 bg-coffee-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-coffee-500">
                        Quantity to refund
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRefundQty((q) => Math.max(1, q - 1))}
                          className="w-6 h-6 rounded-full bg-white border border-coffee-200 text-coffee-800 font-bold"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">
                          {refundQty}
                        </span>
                        <button
                          onClick={() => setRefundQty((q) => Math.min(remaining, q + 1))}
                          className="w-6 h-6 rounded-full bg-white border border-coffee-200 text-coffee-800 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for refund *"
                      className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    {refundError && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                        {refundError}
                      </div>
                    )}
                    <p className="text-xs text-coffee-400">
                      Restores the ingredient stock this quantity deducted.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setRefundingLineId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-[2]"
                        disabled={refundSubmitting}
                        onClick={() => handleRefund(item)}
                      >
                        {refundSubmitting
                          ? "Refunding…"
                          : `Refund ${refundQty}x (${formatMoney((item.lineTotal / item.qty) * refundQty, symbol)})`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
          {order.taxTotal > 0 && (
            <div className="flex justify-between text-coffee-600">
              <span>Tax</span>
              <span>{formatMoney(order.taxTotal, symbol)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-coffee-900">
            <span>Total</span>
            <span>{formatMoney(order.total, symbol)}</span>
          </div>
          {refundedTotal > 0 && (
            <>
              <div className="flex justify-between text-amber-600">
                <span>Refunded</span>
                <span>-{formatMoney(refundedTotal, symbol)}</span>
              </div>
              <div className="flex justify-between font-semibold text-coffee-800">
                <span>Net</span>
                <span>{formatMoney(order.total - refundedTotal, symbol)}</span>
              </div>
            </>
          )}
          <div className="text-coffee-500 capitalize pt-1">Paid via {order.payment.method}</div>
        </div>

        {(order.refunds ?? []).length > 0 && (
          <div className="pt-1 space-y-1">
            <div className="text-xs font-semibold text-coffee-500">Refund History</div>
            {order.refunds!.map((r) => (
              <div
                key={r.id}
                className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
              >
                <div className="flex justify-between font-medium text-amber-800">
                  <span>
                    {r.qty}x {r.productName}
                  </span>
                  <span>-{formatMoney(r.amount, symbol)}</span>
                </div>
                <div className="text-amber-700 mt-0.5">{r.reason}</div>
                <div className="text-amber-600 mt-0.5">
                  {r.refundedByName} · {format(r.refundedAt, "MMM d, h:mm a")}
                </div>
              </div>
            ))}
          </div>
        )}

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

        {isAdmin && (
          <div className="pt-2 border-t border-coffee-100">
            {!deleteConfirming ? (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => setDeleteConfirming(true)}
              >
                Delete Receipt
              </Button>
            ) : (
              <div className="space-y-2">
                {deleteError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {deleteError}
                  </div>
                )}
                <p className="text-xs text-coffee-400">
                  Permanently removes this receipt from history — it will no longer appear
                  anywhere, including reports.
                  {order.status === "completed" &&
                    " Restores any ingredient stock this sale still has deducted."}{" "}
                  This can't be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setDeleteConfirming(false);
                      setDeleteError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-[2]"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? "Deleting…" : "Confirm Delete"}
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
