import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import type { Supplier } from "../../types";
import { Button, Card, Input, Modal, EmptyState } from "../../components/ui";

function empty(): Omit<Supplier, "id"> {
  return { name: "", contactPerson: "", phone: "", email: "", address: "" };
}

export default function SuppliersTab() {
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function openCreate() {
    setForm(empty());
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
    setEditingId(s.id);
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) await db.suppliers.update(editingId, form);
    else await db.suppliers.add({ ...form, id: newId() });
    setOpen(false);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New Supplier</Button>
      </div>
      {!suppliers || suppliers.length === 0 ? (
        <EmptyState text="No suppliers yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-coffee-900">{s.name}</div>
                <div className="text-xs text-coffee-400">
                  {[s.contactPerson, s.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button className="text-xs font-semibold text-accent-dark" onClick={() => openEdit(s)}>
                Edit
              </button>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Supplier" : "New Supplier"}
        footer={
          <Button onClick={handleSave} className="w-full">
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Supplier name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Contact person"
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
