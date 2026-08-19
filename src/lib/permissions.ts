import type { Role } from "../types";

export type NavKey =
  | "pos"
  | "shift"
  | "inventory"
  | "products"
  | "expenses"
  | "reports"
  | "users"
  | "settings";

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  pos: ["admin", "cashier"],
  shift: ["admin", "cashier"],
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
  return "/pos";
}
