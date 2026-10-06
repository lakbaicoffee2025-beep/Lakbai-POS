import { useLiveQuery } from "dexie-react-hooks";
import { formatDistanceToNow } from "date-fns";
import { db } from "../../db/db";
import { useCartStore } from "../../store/cartStore";
import { useSettingsStore } from "../../store/settingsStore";
import { computeOrderTotals } from "../../lib/cartMath";
import { formatMoney } from "../../lib/format";
import { Modal, Button, EmptyState } from "../../components/ui";
import type { OpenTicket } from "../../types";

export default function OpenTicketsPanel({
  shiftId,
  onClose,
}: {
  shiftId: string;
  onClose: () => void;
}) {
  // Scoped to the shift currently open on this register — a ticket held
  // during a since-closed shift shouldn't resurface and get charged
  // against a shift it has nothing to do with.
  const tickets = useLiveQuery(
    () => db.openTickets.where("shiftId").equals(shiftId).reverse().sortBy("createdAt"),
    [shiftId]
  );
  const cartLines = useCartStore((s) => s.lines);
  const resumeTicket = useCartStore((s) => s.resumeTicket);
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

  function handleResume(t: OpenTicket) {
    if (
      cartLines.length > 0 &&
      !confirm("Your current cart isn't empty — resuming this ticket will replace it. Continue?")
    ) {
      return;
    }
    // Deliberately NOT deleted here — it only comes off Open Tickets once
    // the sale it becomes actually completes (checkout) or is explicitly
    // deleted below. That way switching to a different ticket, or backing
    // out without paying, never loses it; and holding it again re-uses
    // this same ticket (see HoldTicketModal) instead of asking for its
    // name a second time.
    resumeTicket(t);
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
            <div key={t.id} className="rounded-lg border border-coffee-100 p-3 dark:border-coffee-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900 dark:text-cream-50">{t.name}</div>
                  <div className="text-xs text-coffee-400">
                    {t.lines.length} item{t.lines.length !== 1 ? "s" : ""} ·{" "}
                    {formatMoney(ticketTotal(t), symbol)} · held{" "}
                    {formatDistanceToNow(t.createdAt, { addSuffix: true })} by {t.createdByName}
                  </div>
                  {t.notes && <div className="text-sm text-coffee-600 dark:text-coffee-300 mt-1">{t.notes}</div>}
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
