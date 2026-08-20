import { useLiveQuery } from "dexie-react-hooks";
import { formatDistanceToNow } from "date-fns";
import { db } from "../../db/db";
import { useCartStore } from "../../store/cartStore";
import { useSettingsStore } from "../../store/settingsStore";
import { computeOrderTotals } from "../../lib/cartMath";
import { formatMoney } from "../../lib/format";
import { Modal, Button, EmptyState } from "../../components/ui";
import type { OpenTicket } from "../../types";

export default function OpenTicketsPanel({ onClose }: { onClose: () => void }) {
  const tickets = useLiveQuery(
    () => db.openTickets.orderBy("createdAt").reverse().toArray(),
    []
  );
  const cartLines = useCartStore((s) => s.lines);
  const loadCart = useCartStore((s) => s.loadCart);
  const settings = useSettingsStore((s) => s.settings);
  const symbol = settings?.currencySymbol ?? "₱";

  function ticketTotal(t: OpenTicket): number {
    return computeOrderTotals(
      t.lines,
      t.orderDiscount,
      settings?.taxRate ?? 0,
      settings?.taxInclusive ?? true
    ).total;
  }

  async function handleResume(t: OpenTicket) {
    if (
      cartLines.length > 0 &&
      !confirm("Your current cart isn't empty — resuming this ticket will replace it. Continue?")
    ) {
      return;
    }
    loadCart(t.lines, t.orderDiscount);
    await db.openTickets.delete(t.id);
    onClose();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this held ticket? This can't be undone.")) return;
    await db.openTickets.delete(id);
  }

  return (
    <Modal open onClose={onClose} title="Open Tickets" wide>
      {!tickets || tickets.length === 0 ? (
        <EmptyState text="No held tickets. Use Hold on the cart to park an order before payment." />
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-lg border border-coffee-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900">{t.name}</div>
                  <div className="text-xs text-coffee-400">
                    {t.lines.length} item{t.lines.length !== 1 ? "s" : ""} ·{" "}
                    {formatMoney(ticketTotal(t), symbol)} · held{" "}
                    {formatDistanceToNow(t.createdAt, { addSuffix: true })} by {t.createdByName}
                  </div>
                  {t.notes && <div className="text-sm text-coffee-600 mt-1">{t.notes}</div>}
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-coffee-300 hover:text-red-500 shrink-0"
                  aria-label="Delete ticket"
                >
                  ✕
                </button>
              </div>
              <Button size="sm" className="w-full mt-2" onClick={() => handleResume(t)}>
                Resume
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
