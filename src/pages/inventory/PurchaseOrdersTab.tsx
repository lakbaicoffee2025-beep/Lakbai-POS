import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { nextPoNo } from "../../db/counters";
import { receivePurchaseOrder } from "../../db/inventory";
import { useAuthStore } from "../../store/authStore";
import { useSettingsStore } from "../../store/settingsStore";
import { formatMoney } from "../../lib/format";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "../../types";
import { Button, Card, Input, Modal, Select, Badge, EmptyState } from "../../components/ui";

const STATUS_TONE: Record<PurchaseOrderStatus, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  ordered: "warning",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

export default function PurchaseOrdersTab() {
  const pos = useLiveQuery(
    () => db.purchaseOrders.orderBy("createdAt").reverse().toArray(),
    []
  );
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";

  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);

  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

  async function openCreate() {
    // Resume an unfinished draft (e.g. the browser closed mid-entry) instead
    // of silently discarding it — only start blank if there wasn't one.
    const draft = await db.purchaseOrderDrafts.get(currentUser.id);
    if (draft && draft.items.length > 0) {
      setSupplierId(draft.supplierId);
      setItems(draft.items);
    } else {
      setSupplierId(suppliers?.[0]?.id ?? "");
      setItems([]);
    }
    setCreateOpen(true);
  }

  // Autosave the in-progress PO while the create modal is open, so an
  // accidental close doesn't lose it. Not cleared on Cancel/backdrop-close
  // (Modal's onClose doesn't distinguish an accidental dismiss from a
  // deliberate one) — only once the PO is actually created.
  useEffect(() => {
    if (!createOpen) return;
    db.purchaseOrderDrafts.put({
      staffId: currentUser.id,
      supplierId,
      items,
      updatedAt: Date.now(),
    });
  }, [createOpen, currentUser.id, supplierId, items]);

  function addItem() {
    const ing = (ingredients ?? []).find(
      (i) => !items.some((it) => it.ingredientId === i.id)
    );
    if (!ing) return;
    setItems([
      ...items,
      { ingredientId: ing.id, ingredientName: ing.name, qtyOrdered: 1, qtyReceived: 0, unitCost: ing.costPerUnit },
    ]);
  }
  function updateItem(idx: number, patch: Partial<PurchaseOrderItem>) {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleCreate(status: "draft" | "ordered") {
    if (!supplierId || items.length === 0) {
      alert("Select a supplier and add at least one item.");
      return;
    }
    const supplier = suppliers?.find((s) => s.id === supplierId);
    const poNo = await nextPoNo();
    const po: PurchaseOrder = {
      id: newId(),
      poNo,
      supplierId,
      supplierName: supplier?.name ?? "",
      status,
      items,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: Date.now(),
      orderedAt: status === "ordered" ? Date.now() : undefined,
    };
    await db.purchaseOrders.add(po);
    await db.purchaseOrderDrafts.delete(currentUser.id);
    setCreateOpen(false);
  }

  async function markOrdered(po: PurchaseOrder) {
    await db.purchaseOrders.update(po.id, { status: "ordered", orderedAt: Date.now() });
  }

  function openReceive(po: PurchaseOrder) {
    setReceiveTarget(po);
    const defaults: Record<string, string> = {};
    for (const item of po.items) {
      defaults[item.ingredientId] = String(item.qtyOrdered - item.qtyReceived);
    }
    setReceiveQtys(defaults);
  }

  async function handleReceiveSubmit() {
    if (!receiveTarget) return;
    const map = new Map<string, number>();
    for (const [ingredientId, val] of Object.entries(receiveQtys)) {
      const qty = parseFloat(val) || 0;
      if (qty > 0) map.set(ingredientId, qty);
    }
    if (map.size === 0) return;
    await receivePurchaseOrder(receiveTarget, map, currentUser.id, currentUser.name);
    setReceiveTarget(null);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!suppliers || suppliers.length === 0}>
          + New Purchase Order
        </Button>
      </div>
      {(!suppliers || suppliers.length === 0) && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Add a supplier first before creating a purchase order.
        </div>
      )}

      {!pos || pos.length === 0 ? (
        <EmptyState text="No purchase orders yet." />
      ) : (
        <div className="space-y-2">
          {pos.map((po) => (
            <Card key={po.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-coffee-900">
                    PO #{po.poNo} · {po.supplierName}
                  </div>
                  <div className="text-xs text-coffee-400">
                    {format(po.createdAt, "MMM d, yyyy")} · {po.items.length} item(s) ·{" "}
                    {formatMoney(
                      po.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0),
                      symbol
                    )}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[po.status]}>
                  {po.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-coffee-500 space-y-0.5">
                {po.items.map((it) => (
                  <div key={it.ingredientId} className="flex justify-between">
                    <span>{it.ingredientName}</span>
                    <span>
                      {it.qtyReceived}/{it.qtyOrdered} received
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {po.status === "draft" && (
                  <Button size="sm" variant="secondary" onClick={() => markOrdered(po)}>
                    Mark as Ordered
                  </Button>
                )}
                {(po.status === "ordered" || po.status === "partially_received") && (
                  <Button size="sm" onClick={() => openReceive(po)}>
                    Receive Stock
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Purchase Order"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => handleCreate("draft")}>
              Save Draft
            </Button>
            <Button onClick={() => handleCreate("ordered")}>Save & Mark Ordered</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={item.ingredientId}
                  onChange={(e) => {
                    const ing = ingredients?.find((i) => i.id === e.target.value);
                    updateItem(idx, {
                      ingredientId: e.target.value,
                      ingredientName: ing?.name ?? "",
                      unitCost: ing?.costPerUnit ?? item.unitCost,
                    });
                  }}
                  className="flex-1"
                >
                  {(ingredients ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
                <input
                  type="number"
                  value={item.qtyOrdered}
                  onChange={(e) => updateItem(idx, { qtyOrdered: parseFloat(e.target.value) || 0 })}
                  className="w-20 rounded-lg border border-coffee-200 px-2 py-2 text-sm"
                  placeholder="Qty"
                />
                <input
                  type="number"
                  value={item.unitCost}
                  onChange={(e) => updateItem(idx, { unitCost: parseFloat(e.target.value) || 0 })}
                  className="w-24 rounded-lg border border-coffee-200 px-2 py-2 text-sm"
                  placeholder="Unit cost"
                />
                <button onClick={() => removeItem(idx)} className="text-coffee-300 hover:text-red-500">
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addItem}
              disabled={!ingredients || items.length >= ingredients.length}
              className="text-xs font-semibold text-accent-dark disabled:opacity-40"
            >
              + Add Item
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!receiveTarget}
        onClose={() => setReceiveTarget(null)}
        title={`Receive PO #${receiveTarget?.poNo ?? ""}`}
        footer={
          <Button onClick={handleReceiveSubmit} className="w-full">
            Confirm Receive
          </Button>
        }
      >
        <div className="space-y-3">
          {receiveTarget?.items.map((item) => (
            <div key={item.ingredientId}>
              <label className="text-xs text-coffee-400 mb-1 block">
                {item.ingredientName} (ordered {item.qtyOrdered}, already received{" "}
                {item.qtyReceived})
              </label>
              <Input
                type="number"
                value={receiveQtys[item.ingredientId] ?? "0"}
                onChange={(e) =>
                  setReceiveQtys({ ...receiveQtys, [item.ingredientId]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
