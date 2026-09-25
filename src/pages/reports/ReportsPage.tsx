import { useState } from "react";
import { PageHeader } from "../../components/ui";
import SalesReportTab from "./SalesReportTab";
import ShiftsReportTab from "./ShiftsReportTab";
import ExpensesReportTab from "./ExpensesReportTab";
import InventoryReportTab from "./InventoryReportTab";
import ReconciliationReportTab from "./ReconciliationReportTab";

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "shifts", label: "Shifts" },
  { key: "expenses", label: "Expenses" },
  { key: "inventory", label: "Inventory" },
  { key: "reconciliation", label: "Reconciliation" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>("sales");

  return (
    <div>
      <div className="sticky top-0 z-20">
        <PageHeader title="Reports" subtitle="Sales, shifts, expenses & inventory" sticky={false} />
        <div className="bg-white border-b border-coffee-100 px-4 flex gap-1 overflow-x-auto no-scrollbar">
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
      </div>
      {tab === "sales" && <SalesReportTab />}
      {tab === "shifts" && <ShiftsReportTab />}
      {tab === "expenses" && <ExpensesReportTab />}
      {tab === "inventory" && <InventoryReportTab />}
      {tab === "reconciliation" && <ReconciliationReportTab />}
    </div>
  );
}
