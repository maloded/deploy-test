// The one gallery state: which photo, which spot is open. The gallery UI, the address (hash) and the agent
// bridge all read and change THIS store, so they cannot disagree. Framework-free: the component subscribes with
// useSyncExternalStore; the clock and the timers are injected so the "do not fight the visitor" rule is testable.

export type GalleryState = {
  index: number;
  spotId: string | null;
  /** Who made the last change: the visitor, an address or the agent (api), the slideshow (auto), or the initial state. The slideshow is never announced. */
  source: "init" | "user" | "api" | "auto";
  /** Counts every change, so a reader can tell two identical states apart (an effect keyed on it re-runs). */
  revision: number;
};

export type GalleryEvent =
  | { type: "go"; index: number }
  | { type: "spot"; index: number; spotId: string }
  | { type: "closeSpot" };

/** How long after the visitor's last touch an agent request waits (queued, the latest one wins). */
export const QUIET_MS = 2000;

/** The pure part: an event applied to a state. Indexes are clamped; moving to another photo closes its spot; a spot opens on its own photo. */
export function reduce(state: GalleryState, event: GalleryEvent, count: number, source: "user" | "api" | "auto"): GalleryState {
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, Math.trunc(i)));
  const next = (patch: Partial<GalleryState>): GalleryState => ({ ...state, ...patch, source, revision: state.revision + 1 });
  switch (event.type) {
    case "go": {
      const index = clamp(event.index);
      return index === state.index ? next({}) : next({ index, spotId: null });
    }
    case "spot":
      return next({ index: clamp(event.index), spotId: event.spotId });
    case "closeSpot":
      return next({ spotId: null });
  }
}

export type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

const realClock: Clock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

export type GalleryStore = {
  get(): GalleryState;
  subscribe(listener: () => void): () => void;
  /** The visitor did something deliberate (a swipe that settled, a tap on a dot, a thumbnail, a spot): applied now; a queued agent request is dropped. */
  user(event: GalleryEvent): void;
  /** The track settled on a photo by itself (programmatic scroll finished, or the visitor's swipe): the index follows, nothing is queued or dropped. */
  follow(index: number): void;
  /** The visitor touched the gallery (pointer, wheel, key): a queued agent request waits for QUIET_MS after the last touch. */
  touch(): void;
  /** The agent or an address asks for a change: "applied" now, or "queued" while the visitor is active (the latest request replaces an earlier queued one). `immediate` skips the wait. */
  request(event: GalleryEvent, options?: { immediate?: boolean }): "applied" | "queued";
  /** The slideshow moves on: applied at once, no touch is recorded, nothing is queued, and it is not announced. */
  auto(index: number): void;
  /** Drops a queued request and its timer (unmount). */
  dispose(): void;
};

export function createGalleryStore(count: number, initial?: Partial<Pick<GalleryState, "index">>, clock: Clock = realClock): GalleryStore {
  let state: GalleryState = { index: Math.max(0, Math.min(count - 1, initial?.index ?? 0)), spotId: null, source: "init", revision: 0 };
  const listeners = new Set<() => void>();
  let lastTouch = Number.NEGATIVE_INFINITY;
  let pending: GalleryEvent | null = null;
  let timer: unknown = null;

  const set = (s: GalleryState) => {
    state = s;
    listeners.forEach((l) => l());
  };
  const clearPending = () => {
    pending = null;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      const wait = lastTouch + QUIET_MS - clock.now();
      if (wait > 0) return arm(); // touched again meanwhile: wait for the new quiet
      const event = pending;
      pending = null;
      if (event) set(reduce(state, event, count, "api"));
    }, Math.max(0, lastTouch + QUIET_MS - clock.now()));
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    user(event) {
      lastTouch = clock.now();
      clearPending();
      set(reduce(state, event, count, "user"));
    },
    follow(index) {
      const i = Math.max(0, Math.min(count - 1, Math.trunc(index)));
      if (i === state.index) return;
      set({ ...state, index: i, spotId: null, source: "user", revision: state.revision + 1 });
    },
    auto(index) {
      set(reduce(state, { type: "go", index }, count, "auto"));
    },
    touch() {
      lastTouch = clock.now();
      if (pending) arm();
    },
    request(event, options) {
      if (!options?.immediate && clock.now() - lastTouch < QUIET_MS) {
        pending = event;
        arm();
        return "queued";
      }
      clearPending();
      set(reduce(state, event, count, "api"));
      return "applied";
    },
    dispose: clearPending,
  };
}
