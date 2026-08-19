import { type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { NAV_ITEMS } from "../lib/navItems";
import { canAccess } from "../lib/permissions";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.currentUser?.role);
  const items = NAV_ITEMS.filter((item) => canAccess(role, item.key));
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-coffee-900 text-cream-50"
                : "text-coffee-700 hover:bg-coffee-100"
            )
          }
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const activeShift = useShiftStore((s) => s.activeShift);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh flex bg-cream-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-coffee-100 bg-white safe-left">
        <div className="px-5 py-5 border-b border-coffee-100">
          <div className="font-bold text-coffee-900 text-lg">☕ LAKBAI</div>
          <div className="text-xs text-coffee-400">Coffee POS</div>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-3 border-t border-coffee-100">
          <div className="text-sm font-semibold text-coffee-900">
            {currentUser?.name}
          </div>
          <div className="text-xs text-coffee-400 capitalize mb-2">
            {currentUser?.role}
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-sm rounded-lg border border-coffee-200 py-2 text-coffee-700 hover:bg-coffee-100"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-white h-full flex flex-col shadow-xl safe-top safe-bottom">
            <div className="px-5 py-4 border-b border-coffee-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-coffee-900 text-lg">
                  ☕ LAKBAI
                </div>
                <div className="text-xs text-coffee-400">Coffee POS</div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-coffee-500 hover:bg-coffee-100"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <div className="p-3 border-t border-coffee-100">
              <div className="text-sm font-semibold text-coffee-900">
                {currentUser?.name}
              </div>
              <div className="text-xs text-coffee-400 capitalize mb-2">
                {currentUser?.role}
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-sm rounded-lg border border-coffee-200 py-2 text-coffee-700 hover:bg-coffee-100"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-3 h-12 landscape:h-10 border-b border-coffee-100 bg-white safe-top safe-left safe-right shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-coffee-700 hover:bg-coffee-100"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="font-semibold text-coffee-900 text-sm truncate">
            ☕ LAKBAI Coffee
          </div>
          <div className="flex items-center gap-1.5">
            {activeShift && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Shift open" />
            )}
            <span className="text-xs text-coffee-500 capitalize max-w-[70px] truncate">
              {currentUser?.name}
            </span>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto safe-left safe-right safe-bottom">
          {children}
        </main>
      </div>
    </div>
  );
}
