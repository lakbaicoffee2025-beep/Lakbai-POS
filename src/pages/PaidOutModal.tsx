import { useState } from "react";
import { recordPaidOut } from "../db/paidOut";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { Modal, Button, Input } from "../components/ui";

export default function PaidOutModal({
  shiftId,
  onClose,
}: {
  shiftId: string;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const amt = parseFloat(amount) || 0;
    if (!description.trim()) {
      setError("Enter what this cash was paid out for.");
      return;
    }
    if (amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordPaidOut(shiftId, description.trim(), amt, currentUser.id, currentUser.name);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Paid Out"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Saving…" : "Record Paid Out"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-coffee-400">
          Record cash taken out of the drawer during this shift — reduces the expected
          cash-in-drawer amount when you close out.
        </p>
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Bought sugar from nearby store"
          />
        </div>
        <div>
          <label className="text-xs text-coffee-400 mb-1 block">Amount ({symbol})</label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
