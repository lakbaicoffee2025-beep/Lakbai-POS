import type { Role } from "../types";

export type NavKey =
  | "dashboard"
  | "pos"
  | "shift"
  | "receipts"
  | "inventory"
  | "products"
  | "expenses"
  | "reports"
  | "users"
  | "settings";

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: ["admin"],
  pos: ["cashier"],
  shift: ["cashier"],
  receipts: ["admin", "cashier"],
  inventory: ["admin", "stockman"],
  products: ["admin"],
  expenses: ["admin", "cashier", "stockman"],
  reports: ["admin"],
  users: ["admin"],
  settings: ["admin"],
};

export function canAccess(role: Role | undefined, key: NavKey): boolean {
  if (!role) return false;
  return NAV_ACCESS[key].includes(role);
}

/** First route a role should land on after login. */
export function homeRouteForRole(role: Role): string {
  if (role === "stockman") return "/inventory";
  if (role === "admin") return "/dashboard";
  return "/pos";
}
