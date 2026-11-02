import { describe, expect, it, vi } from "vitest";
import { createGalleryStore, QUIET_MS, reduce, type Clock, type GalleryState } from "@/lib/gallery-store";

function fakeClock(): Clock & { advance(ms: number): void } {
  let now = 10_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => void timers.delete(id as number),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

const S: GalleryState = { index: 2, spotId: "x", source: "init", revision: 0 };

describe("reduce", () => {
  it("clamps the index, and moving to another photo closes its spot", () => {
    expect(reduce(S, { type: "go", index: 99 }, 5, "user")).toMatchObject({ index: 4, spotId: null, source: "user", revision: 1 });
    expect(reduce(S, { type: "go", index: -3 }, 5, "user").index).toBe(0);
    expect(reduce(S, { type: "go", index: 2 }, 5, "user").spotId).toBe("x"); // the same photo keeps its spot
  });
  it("opens a spot on its own photo and closes it", () => {
    expect(reduce(S, { type: "spot", index: 3, spotId: "y" }, 5, "api")).toMatchObject({ index: 3, spotId: "y", source: "api" });
    expect(reduce(S, { type: "closeSpot" }, 5, "user").spotId).toBeNull();
  });
});

describe("the store", () => {
  it("applies an agent request at once when the visitor has not touched the gallery", () => {
    const clock = fakeClock();
    const store = createGalleryStore(14, undefined, clock);
    expect(store.request({ type: "go", index: 6 })).toBe("applied");
    expect(store.get()).toMatchObject({ index: 6, source: "api" });
  });

  it("queues a request made within 2 s of the visitor's action; it applies once, after the quiet", () => {
    const clock = fakeClock();
    const store = createGalleryStore(14, undefined, clock);
    store.user({ type: "go", index: 3 });
    expect(store.request({ type: "go", index: 9 })).toBe("queued");
    expect(store.get().index).toBe(3);
    clock.advance(QUIET_MS - 1);
    expect(store.get().index).toBe(3);
    clock.advance(2);
    expect(store.get()).toMatchObject({ index: 9, source: "api" });
  });

  it("the latest queued request wins", () => {
    const clock = fakeClock();
    const store = createGalleryStore(14, undefined, clock);
    store.user({ type: "go", index: 1 });
    store.request({ type: "go", index: 5 });
    store.request({ type: "spot", index: 7, spotId: "tyres" });
    clock.advance(QUIET_MS + 1);
    expect(store.get()).toMatchObject({ index: 7, spotId: "tyres" });
  });

  it("a touch pushes the quiet out; a deliberate visitor action drops the queued request", () => {
    const clock = fakeClock();
    const store = createGalleryStore(14, undefined, clock);
    store.user({ type: "go", index: 1 });
    store.request({ type: "go", index: 9 });
    clock.advance(1500);
    store.touch();
    clock.advance(1500); // 3 s after the action but 1.5 s after the touch
    expect(store.get().index).toBe(1);
    clock.advance(600);
    expect(store.get().index).toBe(9);

    store.user({ type: "go", index: 2 });
    store.request({ type: "go", index: 12 });
    clock.advance(500);
    store.user({ type: "go", index: 3 });
    clock.advance(10_000);
    expect(store.get().index).toBe(3);
  });

  it("follow() moves the index without making the visitor 'active' and closes the spot", () => {
    const clock = fakeClock();
    const store = createGalleryStore(14, undefined, clock);
    store.request({ type: "spot", index: 4, spotId: "s" });
    store.follow(5);
    expect(store.get()).toMatchObject({ index: 5, spotId: null });
    expect(store.request({ type: "go", index: 8 })).toBe("applied"); // a settling programmatic scroll is not a visitor action
  });

  it("notifies subscribers on every change, and unsubscribing stops it", () => {
    const clock = fakeClock();
    const store = createGalleryStore(3, undefined, clock);
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.user({ type: "go", index: 1 });
    clock.advance(QUIET_MS + 1);
    store.request({ type: "closeSpot" });
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    store.user({ type: "go", index: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("dispose drops a queued request", () => {
    const clock = fakeClock();
    const store = createGalleryStore(5, undefined, clock);
    store.user({ type: "go", index: 1 });
    store.request({ type: "go", index: 4 });
    store.dispose();
    clock.advance(10_000);
    expect(store.get().index).toBe(1);
  });
});
