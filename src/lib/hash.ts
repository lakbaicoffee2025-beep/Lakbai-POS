// Simple client-side PIN/password hashing using Web Crypto SHA-256.
// This is a local-first, single-device POS app (no server), so this is
// meant to deter casual shoulder-surfing of stored PINs, not to be
// cryptographically bulletproof against someone with DB file access.
export async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
