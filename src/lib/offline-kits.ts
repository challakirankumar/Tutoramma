/**
 * Offline Class Kits (spec §29): resources a learner saves on this device so
 * they can be read with no connection (power cuts, patchy mobile data).
 * Stored in localStorage only — never synced, cleared with site data.
 */
export interface OfflineKit {
  id: string;
  title: string;
  subject: string;
  grade: string;
  board: string;
  author: string;
  content: string;
  savedAt: number;
}

const KEY = "ta-offline-kits";
const MAX_BYTES = 2_000_000;

export function listKits(): OfflineKit[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as OfflineKit[]) : [];
    return Array.isArray(v) ? v.sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

export function hasKit(id: string) {
  return listKits().some((k) => k.id === id);
}

/** Returns false when the device has no room or storage is blocked. */
export function saveKit(kit: Omit<OfflineKit, "savedAt">): boolean {
  try {
    const next = [{ ...kit, savedAt: Date.now() }, ...listKits().filter((k) => k.id !== kit.id)];
    const json = JSON.stringify(next);
    if (json.length > MAX_BYTES) return false;
    localStorage.setItem(KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function removeKit(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listKits().filter((k) => k.id !== id)));
  } catch {}
}
