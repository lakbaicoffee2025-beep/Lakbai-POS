import { useState } from "react";
import { pullAll } from "../db/remoteSync";
import { RefreshIcon, CheckIcon } from "./icons";

/**
 * Manual "pull latest from the server" button for a page header — the same
 * icon/state pattern used across Dashboard, Receipts, and the POS screen,
 * factored out so every page gets it consistently instead of re-implementing
 * the loading/done animation each time.
 */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function handleRefresh() {
    if (state === "loading") return;
    setState("loading");
    await pullAll();
    setState("done");
    setTimeout(() => setState("idle"), 1200);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={state === "loading"}
      aria-label={label}
      title={label}
      className="w-9 h-9 flex items-center justify-center rounded-lg border border-coffee-200 text-coffee-600 bg-white disabled:opacity-60 dark:border-coffee-700 dark:text-coffee-200 dark:bg-coffee-800"
    >
      {state === "loading" ? (
        <span className="inline-block animate-spin">
          <RefreshIcon size={16} />
        </span>
      ) : state === "done" ? (
        <span className="text-emerald-600 dark:text-emerald-400">
          <CheckIcon size={16} />
        </span>
      ) : (
        <RefreshIcon size={16} />
      )}
    </button>
  );
}
