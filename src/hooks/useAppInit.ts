import { useEffect, useState } from "react";
import { seedIfEmpty } from "../db/seed";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import { useShiftStore } from "../store/shiftStore";

export function useAppInit() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  const currentUser = useAuthStore((s) => s.currentUser);
  const refreshCurrentUser = useAuthStore((s) => s.refreshCurrentUser);
  const loadActiveShift = useShiftStore((s) => s.loadActiveShift);

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      await loadSettings();
      if (currentUser) {
        await refreshCurrentUser();
        await loadActiveShift(currentUser.id);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
