import type { NavKey } from "./permissions";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: string;
  to: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "pos", label: "POS", icon: "🛒", to: "/pos" },
  { key: "shift", label: "Shift", icon: "🕒", to: "/shift" },
  { key: "inventory", label: "Inventory", icon: "📦", to: "/inventory" },
  { key: "products", label: "Products", icon: "☕", to: "/products" },
  { key: "expenses", label: "Expenses", icon: "🧾", to: "/expenses" },
  { key: "reports", label: "Reports", icon: "📊", to: "/reports" },
  { key: "users", label: "Users", icon: "👤", to: "/users" },
  { key: "settings", label: "Settings", icon: "⚙️", to: "/settings" },
];
