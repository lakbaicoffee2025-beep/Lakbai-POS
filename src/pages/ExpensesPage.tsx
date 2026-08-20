import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays } from "date-fns";
import { db } from "../db/db";
import {
  saveExpenseReport,
  deleteExpenseReport,
  newLineItem,
  getYesterdayCarryover,
  clearOldExpensePhotos,
} from "../db/expenseReports";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";
import { useSettingsStore } from "../store/settingsStore";
import { formatMoney } from "../lib/format";
import { computeExpenseTotals } from "../lib/expenseMath";
import { compressImage, readFileAsDataUrl } from "../lib/image";
import type { ExpenseLineItem, CashReturnStatus, ExpenseReport, User } from "../types";
import { PageHeader, Card, Button, Input, Select, Badge, EmptyState } from "../components/ui";

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Admin can always edit/delete any report. Everyone else can only touch
 * their own report, and only within 24 hours of first submitting it. */
function canEditReport(r: ExpenseReport, user: User): boolean {
  if (user.role === "admin") return true;
  if (r.staffId !== user.id) return false;
  return Date.now() - r.createdAt < EDIT_WINDOW_MS;
}

export default function ExpensesPage() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const activeShift = useShiftStore((s) => s.activeShift);
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [date, setDate] = useState(todayStr());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [atmWithdrawal, setAtmWithdrawal] = useState("");
  const [items, setItems] = useState<ExpenseLineItem[]>([newLineItem()]);
  const [returnStatus, setReturnStatus] = useState<CashReturnStatus>(null);
  const [returnedTo, setReturnedTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [carryover, setCarryover] = useState<{ amount: number; reports: ExpenseReport[] } | null>(null);
  const [cleanupDays, setCleanupDays] = useState("30");
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const reports = useLiveQuery(
    () => db.expenseReports.orderBy("createdAt").reverse().limit(30).toArray(),
    []
  );

  useEffect(() => {
    if (editingId) return; // don't show carryover while editing an existing report
    getYesterdayCarryover(date).then((c) => setCarryover(c.amount > 0 ? c : null));
  }, [date, editingId]);

  // Restore whatever was being filled in last time — covers an accidental
  // exit or lost connection before hitting Save. Only fetched once per
  // login session; autosave below stays off until this actually finishes,
  // so it can't race the fetch and overwrite a draft with the form's blank
  // initial state.
  const fetchStartedRef = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    db.expenseDrafts.get(currentUser.id).then((draft) => {
      if (draft) {
        setEditingId(draft.editingId);
        setDate(draft.date);
        setCashReceived(draft.cashReceived);
        setAtmWithdrawal(draft.atmWithdrawal);
        setItems(draft.items.length > 0 ? draft.items : [newLineItem()]);
        setReturnStatus(draft.returnStatus);
        setReturnedTo(draft.returnedTo);
      }
      setRestored(true);
    });
  }, [currentUser.id]);

  // Keep that snapshot current as the form changes.
  useEffect(() => {
    if (!restored) return;
    db.expenseDrafts.put({
      staffId: currentUser.id,
      editingId,
      date,
      cashReceived,
      atmWithdrawal,
      items,
      returnStatus,
      returnedTo,
      updatedAt: Date.now(),
    });
  }, [restored, currentUser.id, editingId, date, cashReceived, atmWithdrawal, items, returnStatus, returnedTo]);

  const totals = computeExpenseTotals(
    parseFloat(cashReceived) || 0,
    parseFloat(atmWithdrawal) || 0,
    items
  );

  function resetForm() {
    setEditingId(null);
    setDate(todayStr());
    setCashReceived("");
    setAtmWithdrawal("");
    setItems([newLineItem()]);
    setReturnStatus(null);
    setReturnedTo("");
    setError(null);
    db.expenseDrafts.delete(currentUser.id);
  }

  function loadForEdit(r: ExpenseReport) {
    setEditingId(r.id);
    setDate(r.date);
    setCashReceived(r.cashReceived ? String(r.cashReceived) : "");
    setAtmWithdrawal(r.atmWithdrawal ? String(r.atmWithdrawal) : "");
    setItems(r.items.length > 0 ? r.items.map((i) => ({ ...i })) : [newLineItem()]);
    setReturnStatus(r.cashReturnStatus);
    setReturnedTo(r.returnedTo ?? "");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateItem(id: string, patch: Partial<ExpenseLineItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    setItems((prev) => [...prev, newLineItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }

  async function handlePhoto(id: string, file: File | undefined) {
    if (!file) return;
    const raw = await readFileAsDataUrl(file);
    const compressed = await compressImage(raw, 1000, 0.82);
    updateItem(id, { photoDataUrl: compressed });
  }

  function applyCarryover() {
    if (!carryover) return;
    const current = parseFloat(cashReceived) || 0;
    setCashReceived((current + carryover.amount).toFixed(2));
    setCarryover(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!date) {
      setError("Select a date.");
      return;
    }
    const cash = parseFloat(cashReceived) || 0;
    const atm = parseFloat(atmWithdrawal) || 0;
    const cleanItems = items.filter((i) => i.description.trim() || i.amount > 0);
    if (cleanItems.length === 0 && cash === 0 && atm === 0) {
      setError("Enter at least a received amount or one expense item.");
      return;
    }
    setSubmitting(true);
    try {
      await saveExpenseReport({
        id: editingId ?? undefined,
        date,
        shiftId: activeShift?.id,
        staffId: currentUser.id,
        staffName: currentUser.name,
        cashReceived: cash,
        atmWithdrawal: atm,
        items: cleanItems,
        cashReturnStatus: returnStatus,
        returnedTo,
      });
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense report? This can't be undone.")) return;
    await deleteExpenseReport(id);
    if (editingId === id) resetForm();
  }

  async function handleCleanupPhotos() {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const cutoff = format(subDays(new Date(), parseInt(cleanupDays, 10)), "yyyy-MM-dd");
      const count = await clearOldExpensePhotos(cutoff);
      setCleanupResult(
        count === 0
          ? "No photos older than that to clear."
          : `Cleared ${count} photo${count === 1 ? "" : "s"}. Amounts and descriptions were kept.`
      );
    } finally {
      setCleaningUp(false);
    }
  }

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Cash/ATM received, itemized spending & change return" />

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-coffee-800">
              {editingId ? "Edit Report" : "New Expense Report"}
            </h3>
            {editingId && (
              <button onClick={resetForm} className="text-xs font-semibold text-coffee-500">
                Cancel Edit
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Staff</label>
              <Input value={currentUser.name} disabled />
            </div>
          </div>

          {carryover && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-amber-800">
                Yesterday's remaining cash: <strong>{formatMoney(carryover.amount, symbol)}</strong>
              </span>
              <Button size="sm" variant="secondary" onClick={applyCarryover}>
                + Add to Cash
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Cash Received</label>
              <Input
                type="number"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">ATM Withdrawal</label>
              <Input
                type="number"
                inputMode="decimal"
                value={atmWithdrawal}
                onChange={(e) => setAtmWithdrawal(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-coffee-400 block">Expense Items</label>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  className="flex-1"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={item.amount || ""}
                  onChange={(e) => updateItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="w-24 shrink-0"
                />
                <label className="shrink-0 cursor-pointer">
                  {item.photoDataUrl ? (
                    <img
                      src={item.photoDataUrl}
                      alt="Receipt"
                      className="w-9 h-9 rounded-lg object-cover border border-coffee-200"
                      onClick={(e) => {
                        e.preventDefault();
                        setViewPhoto(item.photoDataUrl!);
                      }}
                    />
                  ) : (
                    <span className="w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-400">
                      📷
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhoto(item.id, e.target.files?.[0])}
                  />
                </label>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-coffee-300 hover:text-red-500 shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={addItem} className="text-xs font-semibold text-accent-dark">
              + Add Item
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-coffee-100">
            <div className="rounded-lg bg-coffee-50 p-2 text-center">
              <div className="text-[11px] text-coffee-400">Received</div>
              <div className="text-sm font-bold text-coffee-900">
                {formatMoney(totals.amountReceived, symbol)}
              </div>
            </div>
            <div className="rounded-lg bg-coffee-50 p-2 text-center">
              <div className="text-[11px] text-coffee-400">Spent</div>
              <div className="text-sm font-bold text-red-600">
                {formatMoney(totals.totalExpenses, symbol)}
              </div>
            </div>
            <div className="rounded-lg bg-coffee-50 p-2 text-center">
              <div className="text-[11px] text-coffee-400">Remaining</div>
              <div
                className={`text-sm font-bold ${totals.remainingCash >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {formatMoney(totals.remainingCash, symbol)}
              </div>
            </div>
          </div>

          {totals.remainingCash > 0 && (
            <div className="pt-2 space-y-2">
              <label className="text-xs font-semibold text-coffee-600">
                Cash Return ({formatMoney(totals.remainingCash, symbol)})
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm text-coffee-700">
                  <input
                    type="radio"
                    checked={returnStatus === "returned"}
                    onChange={() => setReturnStatus("returned")}
                  />
                  Returned to
                  <Input
                    value={returnedTo}
                    onChange={(e) => setReturnedTo(e.target.value)}
                    placeholder="Name"
                    className="w-32"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-coffee-700">
                  <input
                    type="radio"
                    checked={returnStatus === "not_returned"}
                    onChange={() => setReturnStatus("not_returned")}
                  />
                  Not returned yet
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Saving…" : editingId ? "Update Report" : "Save Report"}
          </Button>
        </Card>

        {currentUser.role === "admin" && (
          <Card className="p-4 space-y-3 border-amber-200">
            <div>
              <h3 className="text-sm font-bold text-coffee-800">Storage Cleanup</h3>
              <p className="text-xs text-coffee-400 mt-0.5">
                Receipt photos take up the most local storage. Clear old ones to free up space
                — amounts and descriptions are kept, only the images are removed. This can't be
                undone.
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                value={cleanupDays}
                onChange={(e) => setCleanupDays(e.target.value)}
                className="flex-1"
              >
                <option value="30">Older than 30 days</option>
                <option value="60">Older than 60 days</option>
                <option value="90">Older than 90 days</option>
              </Select>
              <Button variant="secondary" disabled={cleaningUp} onClick={handleCleanupPhotos}>
                {cleaningUp ? "Clearing…" : "Clear Photos"}
              </Button>
            </div>
            {cleanupResult && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {cleanupResult}
              </div>
            )}
          </Card>
        )}

        <div>
          <h3 className="text-sm font-bold text-coffee-800 mb-2 px-1">Report History</h3>
          {!reports || reports.length === 0 ? (
            <EmptyState text="No expense reports yet." />
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-coffee-900">
                        {format(r.date + "T12:00:00", "MMM d, yyyy")}
                        <span className="text-coffee-400 font-normal"> · {r.staffName}</span>
                      </div>
                      <div className="text-xs text-coffee-400">
                        Received {formatMoney(r.amountReceived, symbol)} · Spent{" "}
                        {formatMoney(r.totalExpenses, symbol)}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs font-semibold shrink-0">
                      {canEditReport(r, currentUser) ? (
                        <>
                          <button className="text-accent-dark" onClick={() => loadForEdit(r)}>
                            Edit
                          </button>
                          <button className="text-red-600" onClick={() => handleDelete(r.id)}>
                            Delete
                          </button>
                        </>
                      ) : (
                        <span className="text-coffee-300" title="Edit window closed">
                          🔒 Locked
                        </span>
                      )}
                    </div>
                  </div>
                  {r.remainingCash > 0 && (
                    <div className="mt-2">
                      {r.cashReturnStatus === "returned" ? (
                        <Badge tone="success">Returned{r.returnedTo ? ` to ${r.returnedTo}` : ""}</Badge>
                      ) : r.cashReturnStatus === "not_returned" ? (
                        <Badge tone="warning">Not returned yet</Badge>
                      ) : (
                        <Badge>Return not recorded</Badge>
                      )}
                    </div>
                  )}
                  {r.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {r.items.map((i) => (
                        <div key={i.id} className="flex items-center justify-between text-xs">
                          <span className="text-coffee-600 truncate">{i.description || "—"}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="font-medium text-coffee-800">
                              {formatMoney(i.amount, symbol)}
                            </span>
                            {i.photoDataUrl && (
                              <img
                                src={i.photoDataUrl}
                                alt="Receipt"
                                className="w-6 h-6 rounded object-cover border border-coffee-200 cursor-pointer"
                                onClick={() => setViewPhoto(i.photoDataUrl!)}
                              />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewPhoto(null)}
        >
          <img src={viewPhoto} alt="Receipt" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
