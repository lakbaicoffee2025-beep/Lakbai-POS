import { create } from "zustand";
import { newId } from "../lib/id";
import type { CartLine, CartLineModifier, DiscountType } from "../types";

function computeLineTotal(line: Omit<CartLine, "lineTotal" | "id">): number {
  const modTotal = line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const gross = (line.unitPrice + modTotal) * line.qty;
  if (!line.discount) return gross;
  if (line.discount.type === "percent") {
    return gross - gross * (line.discount.value / 100);
  }
  return Math.max(0, gross - line.discount.value);
}

interface CartState {
  lines: CartLine[];
  orderDiscount: { id: string; name: string; type: DiscountType; value: number } | null;
  addLine: (
    line: Omit<CartLine, "id" | "lineTotal">
  ) => void;
  removeLine: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  setLineDiscount: (
    id: string,
    discount: { id: string; name: string; type: DiscountType; value: number } | undefined
  ) => void;
  setOrderDiscount: (
    discount: { id: string; name: string; type: DiscountType; value: number } | null
  ) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  orderDiscount: null,
  addLine: (line) =>
    set((state) => ({
      lines: [
        ...state.lines,
        { ...line, id: newId(), lineTotal: computeLineTotal(line) },
      ],
    })),
  removeLine: (id) =>
    set((state) => ({ lines: state.lines.filter((l) => l.id !== id) })),
  updateQty: (id, qty) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.id === id
          ? { ...l, qty, lineTotal: computeLineTotal({ ...l, qty }) }
          : l
      ),
    })),
  setLineDiscount: (id, discount) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.id === id
          ? {
              ...l,
              discount,
              lineTotal: computeLineTotal({ ...l, discount }),
            }
          : l
      ),
    })),
  setOrderDiscount: (discount) => set({ orderDiscount: discount }),
  clearCart: () => set({ lines: [], orderDiscount: null }),
}));

export type { CartLineModifier };
