import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../db/db";
import { newId } from "../lib/id";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { useSettingsStore } from "../store/settingsStore";
import { formatMoney } from "../lib/format";
import type { Expense, PaymentMethod } from "../types";
import { PageHeader, Card, Button, Input, Modal, Select, EmptyState } from "../components/ui";

const CATEGORIES = ["Supplies", "Ingredients", "Utilities", "Maintenance", "Transport", "Other"];

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function ExpensesPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [filterDate, setFilterDate] = useState(todayStr());
  const expenses = useLiveQuery(
    () => db.expenses.where("date").equals(filterDate).reverse().sortBy("createdAt"),
    [filterDate]
  );

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  const dayTotal = (expenses ?? []).reduce((s, e) => s + e.amount, 0);

  function openCreate() {
    setCategory(CATEGORIES[0]);
    setDescription("");
    setAmount("");
    setPaymentMethod("cash");
    setOpen(true);
  }

  async function handleSave() {
    const amt = parseFloat(amount) || 0;
    if (!description.trim() || amt <= 0) {
      alert("Please enter a description and a valid amount.");
      return;
    }
    const expense: Expense = {
      id: newId(),
      date: filterDate,
      shiftId: activeShift?.id,
      category,
      description: description.trim(),
      amount: amt,
      paymentMethod,
      recordedBy: currentUser.id,
      recordedByName: currentUser.name,
      createdAt: Date.now(),
    };
    await db.expenses.add(expense);
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Daily store purchases & outflows"
        action={<Button onClick={openCreate}>+ Add Expense</Button>}
      />

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-auto"
          />
          <div className="text-sm text-coffee-500 ml-auto">
            Total: <span className="font-bold text-coffee-900">{formatMoney(dayTotal, symbol)}</span>
          </div>
        </div>

        {!expenses || expenses.length === 0 ? (
          <EmptyState text="No expenses recorded for this date." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-coffee-900 truncate">
                    {e.description}
                  </div>
                  <div className="text-xs text-coffee-400">
                    {e.category} · {e.paymentMethod.toUpperCase()} ·{" "}
                    {format(e.createdAt, "h:mm a")} · {e.recordedByName}
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Expense"
        footer={
          <Button onClick={handleSave} className="w-full">
            Save Expense
          </Button>
        }
      >
        <div className="space-y-3">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Description e.g. Bought 2 sacks of sugar"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1"
            />
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="flex-1"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
            </Select>
          </div>
          {!activeShift && (
            <p className="text-xs text-amber-600">
              No active shift — this expense won't be linked to a shift's cash count.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
