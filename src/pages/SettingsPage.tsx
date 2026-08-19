import { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import type { StoreSettings } from "../types";
import { PageHeader, Card, Button, Input } from "../components/ui";
import ImportCard from "./settings/ImportCard";
import DangerZoneCard from "./settings/DangerZoneCard";

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const [form, setForm] = useState<StoreSettings | null>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!form) return null;

  async function handleSave() {
    if (!form) return;
    await update(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Store configuration" />
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-coffee-800">Store Info</h3>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">Store Name</label>
            <Input
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">Address</label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">Phone</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-coffee-800">Currency & Tax</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Currency Symbol</label>
              <Input
                value={form.currencySymbol}
                onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-coffee-400 mb-1 block">Currency Code</label>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">Tax Rate (%)</label>
            <Input
              type="number"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-coffee-700">
            <input
              type="checkbox"
              checked={form.taxInclusive}
              onChange={(e) => setForm({ ...form, taxInclusive: e.target.checked })}
            />
            Prices are tax-inclusive
          </label>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-coffee-800">Receipt</h3>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">Receipt Footer Message</label>
            <textarea
              value={form.receiptFooter}
              onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-coffee-800">Inventory</h3>
          <div>
            <label className="text-xs text-coffee-400 mb-1 block">
              Default Low-Stock Threshold
            </label>
            <Input
              type="number"
              value={form.lowStockDefaultThreshold}
              onChange={(e) =>
                setForm({ ...form, lowStockDefaultThreshold: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-coffee-800">Confidentiality</h3>
          <label className="flex items-start gap-2 text-sm text-coffee-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.hideSalesFromCashiers}
              onChange={(e) => setForm({ ...form, hideSalesFromCashiers: e.target.checked })}
            />
            <span>
              Blind cash count for cashiers — hide running sales totals and the expected
              cash/GCash amount on the Shift screen so cashiers just record their physical
              count. You'll still see full totals and variances in Reports.
            </span>
          </label>
        </Card>

        <Button className="w-full" size="lg" onClick={handleSave}>
          {saved ? "Saved ✓" : "Save Settings"}
        </Button>

        <ImportCard />
        <DangerZoneCard />
      </div>
    </div>
  );
}
