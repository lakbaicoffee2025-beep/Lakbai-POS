import { create } from "zustand";
import { persist } from "zustand/middleware";
import { db } from "../db/db";
import { hashPin } from "../lib/hash";
import type { User } from "../types";

interface AuthState {
  currentUser: User | null;
  login: (username: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refreshCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      login: async (username, pin) => {
        const uname = username.trim().toLowerCase();
        const user = await db.users
          .where("username")
          .equals(uname)
          .first();
        if (!user) return { ok: false, error: "User not found" };
        if (!user.active) return { ok: false, error: "This account is disabled" };
        const hash = await hashPin(pin);
        if (hash !== user.pinHash) return { ok: false, error: "Incorrect PIN" };
        set({ currentUser: user });
        return { ok: true };
      },
      logout: () => set({ currentUser: null }),
      refreshCurrentUser: async () => {
        const current = get().currentUser;
        if (!current) return;
        const fresh = await db.users.get(current.id);
        if (fresh) set({ currentUser: fresh });
        else set({ currentUser: null });
      },
    }),
    {
      name: "lakbai-auth",
      partialize: (state) => ({ currentUser: state.currentUser }),
    }
  )
);
