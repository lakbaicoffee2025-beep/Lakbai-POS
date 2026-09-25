import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetMenuAndInventory, factoryReset } from "../../db/resetData";
import { useAuthStore } from "../../store/authStore";
import { Card, Button, Input } from "../../components/ui";

function ConfirmAction({
  label,
  description,
  confirmPhrase,
  confirmButtonLabel,
  onConfirm,
}: {
  label: string;
  description: string;
  confirmPhrase: string;
  confirmButtonLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
      setTyped("");
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
      <div className="text-sm font-semibold text-red-800">{label}</div>
      <p className="text-xs text-red-700">{description}</p>
      {!open ? (
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          {label}
        </Button>
      ) : (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-red-700">
            Type <span className="font-mono font-bold">{confirmPhrase}</span> to confirm.
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            className="border-red-300"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={typed !== confirmPhrase || busy}
              onClick={handleConfirm}
            >
              {busy ? "Working…" : confirmButtonLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DangerZoneCard() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [menuResetDone, setMenuResetDone] = useState(false);

  return (
    <Card className="p-4 space-y-3 border-red-200">
      <div>
        <h3 className="text-sm font-bold text-red-800">Danger Zone</h3>
        <p className="text-xs text-coffee-400 mt-0.5">
          These actions delete data permanently. There is no undo — export or double-check
          before proceeding.
        </p>
      </div>

      <ConfirmAction
        label="Reset Menu & Inventory"
        description="Deletes all categories, products, modifier groups, discounts, ingredients, suppliers, and purchase orders — useful before rebuilding or re-importing your menu from scratch. Sales history, shifts, expenses, users, and settings are kept."
        confirmPhrase="RESET MENU"
        confirmButtonLabel="Delete Menu & Inventory Data"
        onConfirm={async () => {
          await resetMenuAndInventory();
          setMenuResetDone(true);
          setTimeout(() => setMenuResetDone(false), 4000);
        }}
      />
      {menuResetDone && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Menu and inventory data cleared.
        </div>
      )}

      <ConfirmAction
        label="Factory Reset Everything"
        description="Deletes ALL data — menu, inventory, sales history, shifts, expenses, users, and settings — and restores the app to its default first-run state with the demo accounts. You'll be signed out immediately."
        confirmPhrase="FACTORY RESET"
        confirmButtonLabel="Erase Everything"
        onConfirm={async () => {
          await factoryReset();
          logout();
          navigate("/login", { replace: true });
        }}
      />
    </Card>
  );
}
