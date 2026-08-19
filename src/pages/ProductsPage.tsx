import { useState } from "react";
import { PageHeader } from "../components/ui";
import ProductsTab from "./products/ProductsTab";
import CategoriesTab from "./products/CategoriesTab";
import ModifierGroupsTab from "./products/ModifierGroupsTab";
import DiscountsTab from "./products/DiscountsTab";

const TABS = [
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "modifiers", label: "Modifiers" },
  { key: "discounts", label: "Discounts" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProductsPage() {
  const [tab, setTab] = useState<TabKey>("products");

  return (
    <div>
      <PageHeader title="Products" subtitle="Menu, modifiers & discounts" />
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
      {tab === "products" && <ProductsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "modifiers" && <ModifierGroupsTab />}
      {tab === "discounts" && <DiscountsTab />}
    </div>
  );
}
