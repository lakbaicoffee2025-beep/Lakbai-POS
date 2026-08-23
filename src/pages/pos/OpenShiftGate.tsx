import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useShiftStore } from "../../store/shiftStore";
import { useSettingsStore } from "../../store/settingsStore";
import { Button } from "../../components/ui";

export default function OpenShiftGate({
  darkMode,
  onToggleDarkMode,
}: {
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}) {
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
    <div className="h-full flex items-center justify-center p-6 relative">
      {onToggleDarkMode && (
        <button
          onClick={onToggleDarkMode}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
      )}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-sm p-6 text-center dark:bg-coffee-900 dark:border-coffee-800">
        <div className="text-3xl mb-2">🕒</div>
        <h2 className="text-lg font-bold text-coffee-900 dark:text-cream-50">Start Your Shift</h2>
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
          className="w-full rounded-lg border border-coffee-200 px-3 py-3 text-lg font-semibold text-center outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 mb-4 dark:border-coffee-700 dark:bg-coffee-800 dark:text-cream-50"
        />
        <Button className="w-full" size="lg" onClick={handleOpen} disabled={loading}>
          {loading ? "Starting…" : "Open Shift"}
        </Button>
      </div>
    </div>
  );
}
