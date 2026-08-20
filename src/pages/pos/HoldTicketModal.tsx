import { useState } from "react";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { useCartStore } from "../../store/cartStore";
import { Modal, Button, Input } from "../../components/ui";

export default function HoldTicketModal({ onClose }: { onClose: () => void }) {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift)!;
  const lines = useCartStore((s) => s.lines);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const clearCart = useCartStore((s) => s.clearCart);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Enter a name to label this ticket (e.g. a table or customer name).");
      return;
    }
    setSubmitting(true);
    const now = Date.now();
    await db.openTickets.add({
      id: newId(),
      name: name.trim(),
      notes: notes.trim() || undefined,
      lines,
      orderDiscount,
      shiftId: activeShift.id,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    });
    clearCart();
    setSubmitting(false);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Hold Ticket"
      footer={
        <Button className="w-full" onClick={handleSave} disabled={submitting}>
          {submitting ? "Holding…" : "Hold Ticket"}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-coffee-500">
          Sets this order aside before payment so you can start another sale. Find it again
          under Open Tickets.
        </p>
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Name *</label>
          <Input
            autoFocus
            placeholder="e.g. Table 5, Juan Dela Cruz"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. paying by GCash later, waiting for one more item"
            className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
