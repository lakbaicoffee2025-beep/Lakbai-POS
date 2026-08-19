import { useState } from "react";
import { PageHeader } from "../../components/ui";
import IngredientsTab from "./IngredientsTab";
import SuppliersTab from "./SuppliersTab";
import PurchaseOrdersTab from "./PurchaseOrdersTab";
import MovementLogTab from "./MovementLogTab";

const TABS = [
  { key: "ingredients", label: "Ingredients" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "suppliers", label: "Suppliers" },
  { key: "log", label: "Movement Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InventoryPage() {
  const [tab, setTab] = useState<TabKey>("ingredients");

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
      {tab === "ingredients" && <IngredientsTab />}
      {tab === "purchase-orders" && <PurchaseOrdersTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "log" && <MovementLogTab />}
    </div>
  );
}
