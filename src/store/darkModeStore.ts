import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DarkModeState {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

/**
 * One shared, persisted dark-mode preference for the cashier's screens
 * (POS, Shift, Receipts) — toggling it on any one of those pages applies
 * everywhere else too, instead of each page tracking its own copy.
 */
export const useDarkModeStore = create<DarkModeState>()(
  persist(
    (set) => ({
      darkMode: false,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
    }),
    // Deliberately a different key than the old POS-only toggle
    // ("lakbai-pos-dark-mode", a raw "1"/"0" string) so this JSON-shaped
    // persisted store never collides with — or fails to parse — that
    // legacy value.
    { name: "lakbai-cashier-dark-mode" }
  )
);
