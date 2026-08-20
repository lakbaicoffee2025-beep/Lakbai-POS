import { useState } from "react";
import { PageHeader } from "../../components/ui";
import StockDashboardTab from "./StockDashboardTab";
import IngredientsTab from "./IngredientsTab";
import RestockTab from "./RestockTab";
import SuppliersTab from "./SuppliersTab";
import PurchaseOrdersTab from "./PurchaseOrdersTab";
import MovementLogTab from "./MovementLogTab";
import DailyCountTab from "./DailyCountTab";
import SpoilageTab from "./SpoilageTab";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ingredients", label: "Ingredients" },
  { key: "restock", label: "Restock" },
  { key: "daily-count", label: "Inventory Count" },
  { key: "spoilage", label: "Spoilage" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "suppliers", label: "Suppliers" },
  { key: "log", label: "Movement Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InventoryPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock, purchase orders & suppliers" />
      <div className="bg-white border-b border-coffee-100 px-4 flex gap-1 overflow-x-auto no-scrollbar sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 ${
              tab === t.key
                ? "border-accent text-accent-dark"
                : "border-transparent text-coffee-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "dashboard" && <StockDashboardTab />}
      {tab === "ingredients" && <IngredientsTab />}
      {tab === "restock" && <RestockTab />}
      {tab === "daily-count" && <DailyCountTab />}
      {tab === "spoilage" && <SpoilageTab />}
      {tab === "purchase-orders" && <PurchaseOrdersTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "log" && <MovementLogTab />}
    </div>
  );
}
