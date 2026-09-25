import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { newId } from "../lib/id";
import { hashPin } from "../lib/hash";
import { useAuthStore } from "../store/authStore";
import type { Role, User } from "../types";
import { PageHeader, Card, Button, Input, Modal, Select, Badge, EmptyState } from "../components/ui";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  cashier: "Cashier",
  stockman: "Stockman",
};

function emptyForm() {
  return { name: "", username: "", pin: "", role: "cashier" as Role };
}

export default function UsersPage() {
  const users = useLiveQuery(() => db.users.toArray(), []);
  const currentUser = useAuthStore((s) => s.currentUser)!;

  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
    setOpen(true);
  }
  function openEdit(u: User) {
    setForm({ name: u.name, username: u.username, pin: "", role: u.role });
    setEditingId(u.id);
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!form.name.trim() || !form.username.trim()) {
      setError("Name and username are required.");
      return;
    }
    const uname = form.username.trim().toLowerCase();
    const existing = await db.users.where("username").equals(uname).first();
    if (existing && existing.id !== editingId) {
      setError("Username already taken.");
      return;
    }
    if (editingId) {
      const patch: Partial<User> = { name: form.name.trim(), username: uname, role: form.role };
      if (form.pin) patch.pinHash = await hashPin(form.pin);
      await db.users.update(editingId, patch);
    } else {
      if (!form.pin || form.pin.length < 4) {
        setError("PIN must be at least 4 digits.");
        return;
      }
      await db.users.add({
        id: newId(),
        name: form.name.trim(),
        username: uname,
        pinHash: await hashPin(form.pin),
        role: form.role,
        active: true,
        createdAt: Date.now(),
      });
    }
    setOpen(false);
  }

  async function toggleActive(u: User) {
    if (u.id === currentUser.id) {
      alert("You cannot disable your own account.");
      return;
    }
    await db.users.update(u.id, { active: !u.active });
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage staff accounts & roles"
        action={<Button onClick={openCreate}>+ New User</Button>}
      />

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {!users || users.length === 0 ? (
          <EmptyState text="No users yet." />
        ) : (
          <Card className="divide-y divide-coffee-100">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-coffee-900 flex items-center gap-2">
                    {u.name}
                    {!u.active && <Badge tone="danger">Disabled</Badge>}
                  </div>
                  <div className="text-xs text-coffee-400">
                    @{u.username} · {ROLE_LABEL[u.role]}
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button className="text-coffee-600" onClick={() => toggleActive(u)}>
                    {u.active ? "Disable" : "Enable"}
                  </button>
                  <button className="text-accent-dark" onClick={() => openEdit(u)}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit User" : "New User"}
        footer={
          <Button onClick={handleSave} className="w-full">
            Save User
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoCapitalize="none"
          />
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="admin">Admin — full access</option>
            <option value="cashier">Cashier — POS only</option>
            <option value="stockman">Stockman — inventory only</option>
          </Select>
          <Input
            type="password"
            inputMode="numeric"
            placeholder={editingId ? "New PIN (leave blank to keep current)" : "PIN (min. 4 digits)"}
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
          />
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
