import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { useCartStore } from "../../store/cartStore";
import { useSettingsStore } from "../../store/settingsStore";
import { formatMoney } from "../../lib/format";
import { computeOrderTotals } from "../../lib/cartMath";
import ProductGrid from "./ProductGrid";
import CartPanel from "./CartPanel";
import CheckoutModal from "./CheckoutModal";
import ReceiptModal from "./ReceiptModal";
import OpenShiftGate from "./OpenShiftGate";
import HoldTicketModal from "./HoldTicketModal";
import OpenTicketsPanel from "./OpenTicketsPanel";
import type { Order } from "../../types";

export default function POSPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const loadActiveShift = useShiftStore((s) => s.loadActiveShift);
  const lines = useCartStore((s) => s.lines);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const loadCart = useCartStore((s) => s.loadCart);
  const settings = useSettingsStore((s) => s.settings);

  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const ticketCount = useLiveQuery(() => db.openTickets.count(), []) ?? 0;

  useEffect(() => {
    loadActiveShift(currentUser.id);
  }, [currentUser.id, loadActiveShift]);

  // Restore whatever was in the register when this shift was last touched —
  // covers an accidental page reload/crash mid-sale. Only ever attempted
  // once per shift so it can't fight a deliberate clear afterward.
  const restoredShiftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeShift || restoredShiftRef.current === activeShift.id) return;
    restoredShiftRef.current = activeShift.id;
    db.draftCarts.get(activeShift.id).then((draft) => {
      if (draft && (draft.lines.length > 0 || draft.orderDiscount)) {
        loadCart(draft.lines, draft.orderDiscount);
      }
    });
  }, [activeShift, loadCart]);

  // Keep that snapshot current as the cart changes, so it's always safe to
  // reload. Also naturally clears itself once the cart empties out (sale
  // completed, ticket held, or manually cleared).
  useEffect(() => {
    if (!activeShift) return;
    db.draftCarts.put({
      shiftId: activeShift.id,
      lines,
      orderDiscount,
      updatedAt: Date.now(),
    });
  }, [activeShift, lines, orderDiscount]);

  if (!activeShift) return <OpenShiftGate />;

  const totals = computeOrderTotals(
    lines,
    orderDiscount,
    settings?.taxRate ?? 0,
    settings?.taxInclusive ?? true
  );

  return (
    <div className="h-full flex flex-col landscape:flex-row sm:flex-row">
      <div className="flex-1 min-h-0 min-w-0">
        <ProductGrid
          headerAction={
            <button
              onClick={() => setTicketsOpen(true)}
              className="shrink-0 bg-coffee-900 text-cream-50 rounded-lg pl-3 pr-2.5 text-xs font-semibold shadow-sm flex items-center gap-1.5"
            >
              🎫
              {ticketCount > 0 && (
                <span className="bg-accent rounded-full w-5 h-5 flex items-center justify-center text-[11px]">
                  {ticketCount}
                </span>
              )}
            </button>
          }
        />
      </div>

      {/* Side-by-side cart: kicks in on any landscape screen (phones rotated
          sideways included) as well as at the sm breakpoint for portrait
          tablets/desktop, so a phone always shows the cart alongside the
          menu once it's rotated, regardless of its raw pixel width. */}
      <div className="hidden landscape:flex sm:flex landscape:w-72 sm:w-80 lg:w-96 border-l border-coffee-100 shrink-0">
        <CartPanel onCheckout={() => setCheckoutOpen(true)} onHoldTicket={() => setHoldOpen(true)} />
      </div>

      {/* Mobile portrait only: floating cart bar + full-screen cart sheet */}
      {lines.length > 0 && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="landscape:hidden sm:hidden fixed bottom-3 left-3 right-3 z-30 bg-coffee-900 text-cream-50 rounded-xl px-4 py-3.5 flex items-center justify-between shadow-lg safe-bottom"
        >
          <span className="font-semibold text-sm">
            View Cart · {lines.length} item{lines.length > 1 ? "s" : ""}
          </span>
          <span className="font-bold">
            {formatMoney(totals.total, settings?.currencySymbol ?? "₱")}
          </span>
        </button>
      )}

      {mobileCartOpen && (
        <div className="landscape:hidden sm:hidden fixed inset-0 z-40 bg-white flex flex-col safe-top safe-bottom">
          <div className="flex items-center justify-between px-4 h-12 border-b border-coffee-100 shrink-0">
            <span className="font-bold text-coffee-900">Cart</span>
            <button
              onClick={() => setMobileCartOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-coffee-500 hover:bg-coffee-100"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <CartPanel
              onCheckout={() => {
                setCheckoutOpen(true);
              }}
              onHoldTicket={() => setHoldOpen(true)}
            />
          </div>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutModal
          onClose={() => setCheckoutOpen(false)}
          onComplete={(order) => {
            setCheckoutOpen(false);
            setMobileCartOpen(false);
            setCompletedOrder(order);
          }}
        />
      )}

      {completedOrder && (
        <ReceiptModal order={completedOrder} onClose={() => setCompletedOrder(null)} />
      )}

      {holdOpen && (
        <HoldTicketModal
          onClose={() => {
            setHoldOpen(false);
            setMobileCartOpen(false);
          }}
        />
      )}

      {ticketsOpen && (
        <OpenTicketsPanel
          onClose={() => {
            setTicketsOpen(false);
            setMobileCartOpen(false);
          }}
        />
      )}
    </div>
  );
}
