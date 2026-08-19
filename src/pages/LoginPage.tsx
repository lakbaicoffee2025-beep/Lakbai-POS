import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { homeRouteForRole } from "../lib/permissions";

export default function LoginPage() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const login = useAuthStore((s) => s.login);
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (currentUser) {
    const dest = (location.state as { from?: string } | null)?.from;
    return <Navigate to={dest ?? homeRouteForRole(currentUser.role)} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(username, pin);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Login failed");
      return;
    }
    const user = useAuthStore.getState().currentUser;
    navigate(homeRouteForRole(user!.role), { replace: true });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-coffee-900 p-4 safe-top safe-bottom">
      <div className="w-full max-w-sm bg-cream-50 rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-coffee-900 flex items-center justify-center text-cream-100 text-2xl font-bold mb-3">
            ☕
          </div>
          <h1 className="text-xl font-bold text-coffee-900 text-center">
            {settings?.storeName ?? "LAKBAI Coffee"}
          </h1>
          <p className="text-coffee-500 text-sm mt-1">Point of Sale</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-coffee-700 mb-1">
              Username
            </label>
            <input
              autoFocus
              className="w-full rounded-lg border border-coffee-200 bg-white px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-coffee-700 mb-1">
              PIN
            </label>
            <input
              className="w-full rounded-lg border border-coffee-200 bg-white px-4 py-3 text-base tracking-widest outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !pin}
            className="w-full rounded-lg bg-accent hover:bg-accent-dark disabled:opacity-50 text-white font-semibold py-3 text-base transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-xs text-coffee-400 text-center leading-relaxed">
          Demo accounts: admin/1234 · cashier/1111 · stockman/2222
        </div>
      </div>
    </div>
  );
}
