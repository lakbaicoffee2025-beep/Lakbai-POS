import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAppInit } from "./hooks/useAppInit";
import { useAuthStore } from "./store/authStore";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import { homeRouteForRole } from "./lib/permissions";

import LoginPage from "./pages/LoginPage";
import POSPage from "./pages/pos/POSPage";
import ShiftPage from "./pages/ShiftPage";
import ReceiptsPage from "./pages/ReceiptsPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import ProductsPage from "./pages/ProductsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/reports/ReportsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";

function AppRoot() {
  const currentUser = useAuthStore((s) => s.currentUser);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pos"
        element={
          <ProtectedRoute navKey="pos">
            <AppShell>
              <POSPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift"
        element={
          <ProtectedRoute navKey="shift">
            <AppShell>
              <ShiftPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receipts"
        element={
          <ProtectedRoute navKey="receipts">
            <AppShell>
              <ReceiptsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory/*"
        element={
          <ProtectedRoute navKey="inventory">
            <AppShell>
              <InventoryPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute navKey="products">
            <AppShell>
              <ProductsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute navKey="expenses">
            <AppShell>
              <ExpensesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/*"
        element={
          <ProtectedRoute navKey="reports">
            <AppShell>
              <ReportsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute navKey="users">
            <AppShell>
              <UsersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute navKey="settings">
            <AppShell>
              <SettingsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <Navigate
            to={currentUser ? homeRouteForRole(currentUser.role) : "/login"}
            replace
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const ready = useAppInit();

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-coffee-900 text-cream-50">
        <div className="text-center">
          <div className="text-3xl mb-2">☕</div>
          <div className="text-sm text-coffee-200">Loading LAKBAI Coffee POS…</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppRoot />
    </BrowserRouter>
  );
}
