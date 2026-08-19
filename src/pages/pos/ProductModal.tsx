import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { CartLineModifier, ModifierGroup, Product, ProductVariant } from "../../types";
import { Modal, Button } from "../../components/ui";
import { useSettingsStore } from "../../store/settingsStore";
import { formatMoney } from "../../lib/format";

export default function ProductModal({
  product,
  onClose,
  onAdd,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (payload: {
    variant?: ProductVariant;
    modifiers: CartLineModifier[];
    qty: number;
    notes?: string;
  }) => void;
}) {
  const symbol = useSettingsStore((s) => s.settings?.currencySymbol) ?? "₱";
  const modifierGroups = useLiveQuery(
    () => db.modifierGroups.bulkGet(product.modifierGroupIds),
    [product.id]
  );

  const [variantId, setVariantId] = useState<string | undefined>(
    product.variants[0]?.id
  );
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const variant = product.variants.find((v) => v.id === variantId);

  const groups = useMemo(
    () => (modifierGroups ?? []).filter((g): g is ModifierGroup => !!g),
    [modifierGroups]
  );

  function toggleOption(groupId: string, optionId: string, max: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const unitPrice = product.basePrice + (variant?.priceDelta ?? 0);
  const modifierList: CartLineModifier[] = groups.flatMap((g) =>
    (selected[g.id] ?? []).map((optId) => {
      const opt = g.options.find((o) => o.id === optId)!;
      return {
        groupId: g.id,
        groupName: g.name,
        optionId: opt.id,
        optionName: opt.name,
        priceDelta: opt.priceDelta,
      };
    })
  );
  const modTotal = modifierList.reduce((s, m) => s + m.priceDelta, 0);
  const lineTotal = (unitPrice + modTotal) * qty;

  return (
    <Modal open onClose={onClose} title={product.name} wide>
      <div className="space-y-5">
        {product.variants.length > 0 && (
          <div>
            <div className="text-sm font-semibold text-coffee-800 mb-2">
              Size
            </div>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                    variantId === v.id
                      ? "border-accent bg-accent/10 text-accent-dark"
                      : "border-coffee-200 text-coffee-700"
                  }`}
                >
                  {v.name}
                  {v.priceDelta > 0 ? ` (+${formatMoney(v.priceDelta, symbol)})` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.id}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-coffee-800">
                {g.name}
              </div>
              <div className="text-xs text-coffee-400">
                {g.required ? "Required" : "Optional"}
                {g.max > 1 ? ` · up to ${g.max}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.options.map((opt) => {
                const isSelected = (selected[g.id] ?? []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleOption(g.id, opt.id, g.max)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                      isSelected
                        ? "border-accent bg-accent/10 text-accent-dark"
                        : "border-coffee-200 text-coffee-700"
                    }`}
                  >
                    {opt.name}
                    {opt.priceDelta > 0
                      ? ` (+${formatMoney(opt.priceDelta, symbol)})`
                      : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div className="text-sm font-semibold text-coffee-800 mb-2">
            Notes (optional)
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. less ice, no straw"
            className="w-full rounded-lg border border-coffee-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-coffee-800">Quantity</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-full bg-coffee-100 text-coffee-800 font-bold text-lg"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="w-9 h-9 rounded-full bg-coffee-100 text-coffee-800 font-bold text-lg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-[2]"
          onClick={() =>
            onAdd({ variant, modifiers: modifierList, qty, notes: notes || undefined })
          }
        >
          Add to Cart · {formatMoney(lineTotal, symbol)}
        </Button>
      </div>
    </Modal>
  );
}
