import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { useSettingsStore } from "../../store/settingsStore";
import { Button } from "../../components/ui";

export default function OpenShiftGate() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const openShift = useShiftStore((s) => s.openShift);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const [startingCash, setStartingCash] = useState("0");
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setLoading(true);
    await openShift(currentUser.id, currentUser.name, parseFloat(startingCash) || 0);
    setLoading(false);
  }

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-sm p-6 text-center">
        <div className="text-3xl mb-2">🕒</div>
        <h2 className="text-lg font-bold text-coffee-900">Start Your Shift</h2>
        <p className="text-sm text-coffee-400 mt-1 mb-5">
          Enter your starting cash drawer amount to begin selling.
        </p>
        <label className="text-xs font-medium text-coffee-500 mb-1 block text-left">
          Starting Cash ({symbol})
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={startingCash}
          onChange={(e) => setStartingCash(e.target.value)}
          className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold text-center outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 mb-4"
        />
        <Button className="w-full" size="lg" onClick={handleOpen} disabled={loading}>
          {loading ? "Starting…" : "Open Shift"}
        </Button>
      </div>
    </div>
  );
}
