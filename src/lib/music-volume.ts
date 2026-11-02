// The visitor's music volume: the one thing the player remembers (localStorage, always wrapped; a blocked storage keeps the value
// in memory for this page view). Shaped as an external store so the slider and the audio read the same value (useSyncExternalStore).
import { VOLUME_STORAGE_KEY } from "./music";

type Store = Pick<Storage, "getItem" | "setItem">;

/** A stored text as a volume 0..1, or null when it is not one. */
export function parseVolume(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

const browserStorage = (): Store | undefined => {
  try {
    return window.localStorage; // the accessor itself can throw
  } catch {
    return undefined;
  }
};

let memory: number | null = null; // set once the visitor moves the slider; also the whole memory when the storage is blocked
const listeners = new Set<() => void>();

/** The volume now: this page view's choice, else the stored one, else null (the product's default applies). */
export function getVolume(storage: Store | undefined = browserStorage()): number | null {
  if (memory !== null) return memory;
  try {
    return parseVolume(storage?.getItem(VOLUME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** The visitor's choice: kept for this page view and written to the storage when it can be. */
export function setVolume(value: number, storage: Store | undefined = browserStorage()): void {
  memory = Math.min(1, Math.max(0, value));
  try {
    storage?.setItem(VOLUME_STORAGE_KEY, String(memory));
  } catch {
    // private window or blocked site data: the choice lasts until the page is closed
  }
  listeners.forEach((l) => l());
}

export function subscribeVolume(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // another tab changed it
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** For tests: forget this page view's choice. */
export function resetVolumeMemory(): void {
  memory = null;
}
