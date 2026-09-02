import { create } from "zustand";
import { db } from "../db/db";
import { newId } from "../lib/id";
import type { Shift } from "../types";

interface ShiftState {
  activeShift: Shift | null;
  loadActiveShift: (cashierId: string) => Promise<void>;
  openShift: (cashierId: string, cashierName: string, startingCash: number) => Promise<Shift>;
  closeShift: (
    shiftId: string,
    data: {
      countedCash: number;
      countedGcash: number;
      expectedCash: number;
      expectedGcash: number;
      notes?: string;
    }
  ) => Promise<void>;
  clear: () => void;
}

export const useShiftStore = create<ShiftState>((set) => ({
  activeShift: null,
  loadActiveShift: async (cashierId) => {
    const shift = await db.shifts
      .where("cashierId")
      .equals(cashierId)
      .filter((s) => s.status === "open")
      .first();
    set({ activeShift: shift ?? null });
  },
  openShift: async (cashierId, cashierName, startingCash) => {
    const shift: Shift = {
      id: newId(),
      cashierId,
      cashierName,
      startingCash,
      startedAt: Date.now(),
      status: "open",
    };
    await db.shifts.add(shift);
    set({ activeShift: shift });
    return shift;
  },
  closeShift: async (shiftId, data) => {
    const cashVariance = data.countedCash - data.expectedCash;
    const gcashVariance = data.countedGcash - data.expectedGcash;
    await db.shifts.update(shiftId, {
      status: "closed",
      endedAt: Date.now(),
      countedCash: data.countedCash,
      countedGcash: data.countedGcash,
      expectedCash: data.expectedCash,
      expectedGcash: data.expectedGcash,
      cashVariance,
      gcashVariance,
      notes: data.notes,
    });
    await db.draftCarts.delete(shiftId);
    set({ activeShift: null });
  },
  clear: () => set({ activeShift: null }),
}));
