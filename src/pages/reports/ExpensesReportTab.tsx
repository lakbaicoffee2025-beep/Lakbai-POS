import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { formatMoney } from "../../lib/format";
import { useSettingsStore } from "../../store/settingsStore";
import { Card, Input, EmptyState } from "../../components/ui";

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function ExpensesReportTab() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const expenses = useLiveQuery(
    () => db.expenses.where("date").between(from, to, true, true).toArray(),
    [from, to]
  );

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-coffee-400 text-sm">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="rounded-lg border border-coffee-100 bg-white p-4 flex items-center justify-between">
        <span className="text-sm text-coffee-500">Total Expenses</span>
        <span className="text-xl font-bold text-coffee-900">{formatMoney(total, symbol)}</span>
      </div>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2">By Category</h3>
        {byCategory.size === 0 ? (
          <EmptyState text="No expenses in this range." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {Array.from(byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <div key={cat} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-coffee-700">{cat}</span>
                  <span className="font-semibold text-coffee-900">
                    {formatMoney(amt, symbol)}
                  </span>
                </div>
              ))}
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-coffee-800 mb-2">All Entries</h3>
        {!expenses || expenses.length === 0 ? (
          <EmptyState text="No expenses in this range." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {expenses
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((e) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-coffee-900 truncate">
                      {e.description}
                    </div>
                    <div className="text-xs text-coffee-400">
                      {e.date} · {e.category} · {e.recordedByName}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-coffee-900 shrink-0">
                    {formatMoney(e.amount, symbol)}
                  </div>
                </div>
              ))}
          </Card>
        )}
      </div>
    </div>
  );
}
