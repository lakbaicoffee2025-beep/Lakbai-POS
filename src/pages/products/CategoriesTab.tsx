import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { newId } from "../../lib/id";
import { Button, Card, Input, Modal, EmptyState } from "../../components/ui";
import type { Category } from "../../types";

export default function CategoriesTab() {
  const categories = useLiveQuery(
    () => db.categories.orderBy("sortOrder").toArray(),
    []
  );
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function openCreate() {
    setName("");
    setCreating(true);
  }
  function openEdit(c: Category) {
    setName(c.name);
    setEditing(c);
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (editing) {
      await db.categories.update(editing.id, { name: name.trim() });
      setEditing(null);
    } else {
      const sortOrder = (categories?.length ?? 0);
      await db.categories.add({ id: newId(), name: name.trim(), sortOrder });
      setCreating(false);
    }
  }

  async function handleDelete(c: Category) {
    const inUse = await db.products.where("categoryId").equals(c.id).count();
    if (inUse > 0) {
      alert(`Cannot delete: ${inUse} product(s) use this category.`);
      return;
    }
    if (confirm(`Delete category "${c.name}"?`)) {
      await db.categories.delete(c.id);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ New Category</Button>
      </div>
      {!categories || categories.length === 0 ? (
        <EmptyState text="No categories yet." />
      ) : (
        <Card className="divide-y divide-coffee-100">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-coffee-900">{c.name}</span>
              <div className="flex gap-3 text-xs font-semibold">
                <button className="text-accent-dark" onClick={() => openEdit(c)}>
                  Edit
                </button>
                <button className="text-red-600" onClick={() => handleDelete(c)}>
                  Delete
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
        title={editing ? "Edit Category" : "New Category"}
        footer={
          <Button onClick={handleSave} className="w-full">
            Save
          </Button>
        }
      >
        <Input
          autoFocus
          placeholder="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Modal>
    </div>
  );
}
