import { create } from "zustand";
import { db } from "../db/db";
import type { StoreSettings } from "../types";

interface SettingsState {
  settings: StoreSettings | null;
  load: () => Promise<void>;
  update: (patch: Partial<StoreSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const settings = await db.settings.get("settings");
    set({ settings: settings ?? null });
  },
  update: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...patch };
    await db.settings.put(next);
    set({ settings: next });
  },
}));
