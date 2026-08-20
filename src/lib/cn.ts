import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * clsx + tailwind-merge: combines conditional classNames like clsx, but also
 * resolves conflicting Tailwind utilities (e.g. a shared component's base
 * `w-full` vs. a caller's `w-24`) so the last one wins as intended, instead
 * of leaving it to Tailwind's internal utility generation order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}
