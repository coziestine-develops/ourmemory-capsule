import type { Relationship } from '../types';

const PREFIX = 'mc:relationship:';

/** Last known space for this user, so a page refresh can paint the app instantly while fresh data loads. */
export function readRelationshipCache(userId: string | undefined): Relationship | undefined {
  if (!userId) return undefined;
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    return raw ? (JSON.parse(raw) as Relationship) : undefined;
  } catch {
    return undefined;
  }
}

export function writeRelationshipCache(userId: string, value: Relationship | null): void {
  try {
    if (value) window.localStorage.setItem(PREFIX + userId, JSON.stringify(value));
    else window.localStorage.removeItem(PREFIX + userId);
  } catch {
    // Storage can be unavailable (private mode, quota). The cache is optional.
  }
}

/** Removes every cached space, used on sign-out so nothing lingers on a shared device. */
export function clearRelationshipCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
}
