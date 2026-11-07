export interface BackupSnapshot {
  key: string;
  createdAt: number | null;
  tableCounts: Record<string, number>;
}

const BACKUPS_URL = "/api/backups";

export async function listBackups(): Promise<BackupSnapshot[]> {
  const res = await fetch(BACKUPS_URL);
  if (!res.ok) throw new Error("Couldn't load backups — is the latest version deployed?");
  const body = (await res.json()) as { snapshots?: BackupSnapshot[] };
  return body.snapshots ?? [];
}

export async function restoreBackup(key: string): Promise<string[]> {
  const res = await fetch(BACKUPS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", key }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Restore failed");
  }
  const body = (await res.json()) as { restoredTables: string[] };
  return body.restoredTables;
}
