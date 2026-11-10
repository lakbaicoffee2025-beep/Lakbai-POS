import { useEffect, useState } from "react";
import { format } from "date-fns";
import { listBackups, restoreBackup, type BackupSnapshot } from "../../db/backups";
import { pullAll } from "../../db/remoteSync";
import { Card, Button, Input } from "../../components/ui";

// Tables worth summarizing per snapshot so an admin can tell at a glance
// whether a given time looks like real data or an empty/wiped state,
// without listing every single table.
const HIGHLIGHT_TABLES: { key: string; label: string }[] = [
  { key: "products", label: "products" },
  { key: "users", label: "users" },
  { key: "orders", label: "orders" },
  { key: "shifts", label: "shifts" },
];

function summarize(snap: BackupSnapshot): string {
  return HIGHLIGHT_TABLES.map((t) => `${snap.tableCounts[t.key] ?? 0} ${t.label}`).join(" · ");
}

function groupByDay(snapshots: BackupSnapshot[]): [string, BackupSnapshot[]][] {
  const groups = new Map<string, BackupSnapshot[]>();
  for (const s of snapshots) {
    if (!s.createdAt) continue;
    const day = format(s.createdAt, "EEEE, MMM d, yyyy");
    const list = groups.get(day) ?? [];
    list.push(s);
    groups.set(day, list);
  }
  return Array.from(groups.entries());
}

export default function BackupsCard() {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<BackupSnapshot | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listBackups()
      .then(setSnapshots)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load backups"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreBackup(restoreTarget.key);
      // Pull the just-restored data in immediately so this device (and the
      // Settings page itself) reflects it without waiting on the next poll.
      await pullAll();
      setRestoredAt(format(restoreTarget.createdAt ?? Date.now(), "MMM d, h:mm a"));
      setRestoreTarget(null);
      setConfirmText("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  const groups = snapshots ? groupByDay(snapshots) : [];

  return (
    <Card className="p-4 space-y-3 border-amber-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-coffee-800">Backups</h3>
          <p className="text-xs text-coffee-400 mt-0.5">
            A snapshot of everything is saved automatically every 2 hours and kept for 14 days.
            If something ever goes wrong with the live data, restore it to any of these points —
            separate from the live store, so it's safe even if that gets wiped.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </div>

      {restoredAt && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Restored to the {restoredAt} snapshot. Other devices will pick it up next time they
          sync.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!error && !loading && groups.length === 0 && (
        <p className="text-xs text-coffee-400">
          No backups yet — the first automatic snapshot will appear here within a couple hours of
          this feature going live.
        </p>
      )}

      {groups.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {groups.map(([day, list]) => (
            <div key={day}>
              <div className="text-xs font-semibold text-coffee-500 mb-1">{day}</div>
              <div className="space-y-1">
                {list.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-2 bg-coffee-50 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-coffee-900">
                        {s.createdAt ? format(s.createdAt, "h:mm a") : s.key}
                      </div>
                      <div className="text-xs text-coffee-400 truncate">{summarize(s)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => {
                        setRestoreTarget(s);
                        setConfirmText("");
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !restoring && setRestoreTarget(null)}
          />
          <div className="relative bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-w-md p-5 safe-bottom space-y-3">
            <h2 className="font-bold text-coffee-900">Restore Backup</h2>
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              This replaces ALL current data — products, inventory, users, sales, everything —
              with the snapshot from{" "}
              <strong>
                {restoreTarget.createdAt
                  ? format(restoreTarget.createdAt, "MMM d, yyyy 'at' h:mm a")
                  : restoreTarget.key}
              </strong>
              . Anything recorded after that moment will be lost. This can't be undone.
            </p>
            <p className="text-xs text-coffee-500">
              Type <span className="font-mono font-bold">RESTORE</span> to confirm.
            </p>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-[2]"
                disabled={confirmText !== "RESTORE" || restoring}
                onClick={handleRestore}
              >
                {restoring ? "Restoring…" : "Restore This Backup"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
