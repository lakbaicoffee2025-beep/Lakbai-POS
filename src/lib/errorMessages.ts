/**
 * Dexie doesn't reliably preserve the original error's identity when a
 * write fails inside a transaction — a real QuotaExceededError thrown by
 * IndexedDB itself can come back out wrapped as a plain Error whose
 * `message` happens to start with the original error's name, rather than
 * a distinct `.name` or `instanceof DOMException`. Checking only
 * `instanceof DOMException` misses this entirely — confirmed by forcing
 * this exact error in a test and seeing the generic fallback message
 * instead of the specific one, despite the catch itself working. Check
 * every shape this can plausibly take rather than trusting just one.
 */
export function isQuotaExceededError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof DOMException && e.name === "QuotaExceededError") return true;
  const anyE = e as { name?: unknown; message?: unknown; inner?: unknown };
  if (anyE.name === "QuotaExceededError") return true;
  if (anyE.inner && isQuotaExceededError(anyE.inner)) return true;
  if (typeof anyE.message === "string" && anyE.message.includes("QuotaExceededError")) return true;
  return false;
}

export const QUOTA_EXCEEDED_MESSAGE =
  "Couldn't save — this device is out of storage space. Try removing a photo from this report, or free up space on the phone, then save again.";

export function describeSaveError(e: unknown, fallback = "Couldn't save. Please try again."): string {
  if (isQuotaExceededError(e)) return QUOTA_EXCEEDED_MESSAGE;
  if (e instanceof Error) return `Couldn't save: ${e.message}`;
  return fallback;
}
