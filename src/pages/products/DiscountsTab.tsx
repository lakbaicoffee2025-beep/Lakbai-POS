import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import type { Discount, DiscountType } from "../../types";
import { Button, Card, Input, Modal, Select, Badge, EmptyState } from "../../components/ui";

const empty = { name: "", type: "percent" as DiscountType, value: 0, requiresApproval: false };

export default function DiscountsTab() {
  const discounts = useLiveQuery(() => db.discounts.toArray(), []);
  const [form, setForm] = useState<typeof empty>(empty);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setForm(empty);
    setCreating(true);
  }
  function openEdit(d: Discount) {
    setForm({
      name: d.name,
      type: d.type,
      value: d.value,
      requiresApproval: d.requiresApproval,
    });
    setEditing(d);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editing) {
      await db.discounts.update(editing.id, { ...form });
      setEditing(null);
    } else {
      await db.discounts.add({ id: newId(), ...form, active: true });
      setCreating(false);
    }
  }

  async function toggleActive(d: Discount) {
    await db.discounts.update(d.id, { active: !d.active });
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New Discount</Button>
      </div>
      {!discounts || discounts.length === 0 ? (
        <EmptyState text="No discounts yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {discounts.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-coffee-900 flex items-center gap-2">
                  {d.name}
                  {!d.active && <Badge>Inactive</Badge>}
                  {d.requiresApproval && <Badge tone="warning">Approval</Badge>}
                </div>
                <div className="text-xs text-coffee-400">
                  {d.type === "percent" ? `${d.value}% off` : `₱${d.value} off`}
                </div>
              </div>
              <div className="flex gap-3 text-xs font-semibold">
                <button className="text-coffee-600" onClick={() => toggleActive(d)}>
                  {d.active ? "Disable" : "Enable"}
                </button>
                <button className="text-accent-dark" onClick={() => openEdit(d)}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Edit Discount" : "New Discount"}
        footer={
          <Button onClick={handleSave} className="w-full">
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Discount name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-2">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as DiscountType })}
              className="flex-1"
            >
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed Amount</option>
            </Select>
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              className="w-28"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-coffee-700">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
            />
            Requires manager approval
          </label>
        </div>
      </Modal>
    </div>
  );
}
