import { afterEach, describe, expect, it, vi } from "vitest";
import { fadeVolume, FADE_STEP_MS } from "@/lib/music-fade";
import { FADE_MS } from "@/lib/music";
import { getVolume, parseVolume, resetVolumeMemory, setVolume } from "@/lib/music-volume";

afterEach(() => {
  vi.useRealTimers();
  resetVolumeMemory();
});

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe("parseVolume", () => {
  it("accepts 0..1 and nothing else", () => {
    expect(parseVolume("0")).toBe(0);
    expect(parseVolume("0.25")).toBe(0.25);
    expect(parseVolume("1")).toBe(1);
    for (const bad of ["", " ", "1.5", "-0.1", "loud", "NaN", "Infinity", null, undefined, 0.5]) expect(parseVolume(bad), String(bad)).toBeNull();
  });
});

describe("the stored volume", () => {
  it("is null when nothing is stored, so the product's default applies", () => {
    expect(getVolume(store())).toBeNull();
  });
  it("is read from the storage and written under one key", () => {
    const s = store({ "music-volume": "0.4" });
    expect(getVolume(s)).toBe(0.4);
    // the browser's window is not there in this environment: the listener part is covered in the player tests
    setVolume(0.8, s);
    expect(s.data).toEqual({ "music-volume": "0.8" });
    expect(getVolume(s)).toBe(0.8);
  });
  it("clamps to 0..1", () => {
    const s = store();
    setVolume(3, s);
    expect(getVolume(s)).toBe(1);
    setVolume(-2, s);
    expect(getVolume(s)).toBe(0);
  });
  it("a storage that throws on read is no stored volume; on write the choice stays in memory", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(getVolume(blocked)).toBeNull();
    expect(() => setVolume(0.3, blocked)).not.toThrow();
    expect(getVolume(blocked)).toBe(0.3);
  });
  it("no storage at all works too", () => {
    expect(getVolume(undefined)).toBeNull();
    expect(() => setVolume(0.2, undefined)).not.toThrow();
    expect(getVolume(undefined)).toBe(0.2);
  });
});

describe("fadeVolume", () => {
  it("is 300 ms by default", () => {
    expect(FADE_MS).toBe(300);
  });
  it("ramps linearly in steps and calls done once at the end", () => {
    vi.useFakeTimers();
    const audio = { volume: 0 };
    const done = vi.fn();
    fadeVolume(audio, 0.6, 300, done);
    vi.advanceTimersByTime(FADE_STEP_MS * 5);
    expect(audio.volume).toBeCloseTo(0.6 * (5 / 15), 5);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(audio.volume).toBe(0.6);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("fades down from the current volume", () => {
    vi.useFakeTimers();
    const audio = { volume: 0.5 };
    fadeVolume(audio, 0, 300);
    vi.advanceTimersByTime(300);
    expect(audio.volume).toBe(0);
  });
  it("finishes at once when there is no distance or no time", () => {
    const done = vi.fn();
    const audio = { volume: 0.5 };
    fadeVolume(audio, 0.5, 300, done);
    expect(done).toHaveBeenCalledTimes(1);
    fadeVolume(audio, 0.2, 0, done);
    expect(audio.volume).toBe(0.2);
    expect(done).toHaveBeenCalledTimes(2);
  });
  it("the returned function stops it where it is, without done", () => {
    vi.useFakeTimers();
    const audio = { volume: 0 };
    const done = vi.fn();
    const stop = fadeVolume(audio, 1, 300, done);
    vi.advanceTimersByTime(100);
    stop();
    const at = audio.volume;
    vi.advanceTimersByTime(1000);
    expect(audio.volume).toBe(at);
    expect(done).not.toHaveBeenCalled();
  });
  it("keeps the volume inside 0..1", () => {
    const audio = { volume: 0 };
    fadeVolume(audio, 5, 0);
    expect(audio.volume).toBe(1);
  });
});
