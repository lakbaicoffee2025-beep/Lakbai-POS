import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { canAccess, homeRouteForRole, type NavKey } from "../lib/permissions";

export function ProtectedRoute({
  navKey,
  children,
}: {
  navKey: NavKey;
  children: ReactNode;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);

  if (!currentUser) return <Navigate to="/login" replace />;
  if (!canAccess(currentUser.role, navKey)) {
    return <Navigate to={homeRouteForRole(currentUser.role)} replace />;
  }
  return <>{children}</>;
}
