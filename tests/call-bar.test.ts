import { describe, expect, it } from "vitest";
import { barKind, barText, BAR_QUERY, formatTimer } from "@/lib/call-bar";
import { UI_KEYS, ui } from "@/lib/ui-strings";

const avatar = { name: "Sofia", role: { en: "Sales Rep", de: "Verkaufsberaterin" } };
const text = (over: Partial<Parameters<typeof barText>[0]> = {}) => barText({ kind: "idle", phase: "idle", state: "idle", avatar, lang: "de", seconds: 0, ...over });

describe("the call bar's faces", () => {
  it("one for each phase of a call: a call that did not start or dropped is an error", () => {
    expect(barKind("idle")).toBe("idle");
    expect(barKind("connecting")).toBe("connecting");
    expect(barKind("live")).toBe("live");
    expect(barKind("failed")).toBe("error");
    expect(barKind("dropped")).toBe("error");
  });

  it("is for a window narrower than 900px, the header's own breakpoint", () => {
    expect(BAR_QUERY).toBe("(width < 56.25em)");
  });
});

describe("the timer", () => {
  it("reads 00:01, 12:05, and 1:02:03 from an hour on", () => {
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(1)).toBe("00:01");
    expect(formatTimer(65)).toBe("01:05");
    expect(formatTimer(725)).toBe("12:05");
    expect(formatTimer(3723)).toBe("1:02:03");
  });
  it("floors fractions and never goes below zero", () => {
    expect(formatTimer(1.9)).toBe("00:01");
    expect(formatTimer(-5)).toBe("00:00");
  });
});

describe("what the two lines say", () => {
  it("waiting: the name and the job over her invitation (German and English)", () => {
    expect(text()).toEqual({ title: "Sofia", small: "Verkaufsberaterin", timer: "", line: "Rufen Sie mich an – ich beantworte Ihre Fragen" });
    expect(text({ lang: "en" })).toEqual({ title: "Sofia", small: "Sales Rep", timer: "", line: "Call me – I'll answer your questions" });
  });

  it("waiting without a role: no small text", () => {
    expect(text({ avatar: { name: "Sofia", role: null } }).small).toBe("");
  });

  it("connecting: the status and a hint for the browser's question", () => {
    expect(text({ kind: "connecting", phase: "connecting" })).toMatchObject({ title: "Verbinde…", line: "Mikrofon erlauben", timer: "" });
    expect(text({ kind: "connecting", phase: "connecting", lang: "en" })).toMatchObject({ title: "Connecting…", line: "Allow the microphone" });
  });

  it("in a call: 'Live call' with the timer, then whether she listens or speaks", () => {
    expect(text({ kind: "live", phase: "live", state: "call", seconds: 1 })).toEqual({ title: "Live-Anruf", small: "", timer: "00:01", line: "Sofia hört zu…" });
    expect(text({ kind: "live", phase: "live", state: "speaking", seconds: 75, lang: "en" })).toEqual({ title: "Live call", small: "", timer: "01:15", line: "Sofia is speaking…" });
    expect(text({ kind: "live", phase: "live", state: "speaking", seconds: 5 }).line).toBe("Sofia spricht…");
  });

  it("an error: what happened in a word, over 'Try again'", () => {
    expect(text({ kind: "error", phase: "failed" })).toMatchObject({ title: "Fehlgeschlagen", line: "Erneut versuchen" });
    expect(text({ kind: "error", phase: "dropped", lang: "en" })).toMatchObject({ title: "Disconnected", line: "Try again" });
  });

  it("never carries the example conversation: nothing of avatar.example is in any face", () => {
    const withExample = { ...avatar, example: { en: [{ speaker: "agent", text: "EXAMPLE-LINE" }] } };
    for (const [kind, phase, state] of [["idle", "idle", "idle"], ["connecting", "connecting", "idle"], ["live", "live", "call"], ["error", "failed", "idle"]] as const) {
      const t = barText({ kind, phase, state, avatar: withExample as never, lang: "en", seconds: 3 });
      expect(JSON.stringify(t)).not.toContain("EXAMPLE-LINE");
    }
  });

  it("uses the page's name for her, not a fixed one", () => {
    expect(text({ kind: "live", phase: "live", state: "call", avatar: { name: "Mara", role: null } }).line).toBe("Mara hört zu…");
  });
});

describe("the strings", () => {
  it("every agent.bar.* string exists in German and English, none is empty, and the invitation is a sentence of its own", () => {
    const keys = UI_KEYS.filter((k) => k.startsWith("agent.bar."));
    expect(keys.sort()).toEqual(["agent.bar.connecting", "agent.bar.dropped", "agent.bar.failed", "agent.bar.group", "agent.bar.invite", "agent.bar.listening", "agent.bar.live", "agent.bar.mic", "agent.bar.retry", "agent.bar.show", "agent.bar.speaking"]);
    for (const k of keys) for (const l of ["de", "en"] as const) expect(ui(k, l).length, `${k} ${l}`).toBeGreaterThan(0);
    expect(ui("agent.bar.invite", "de")).not.toBe(ui("agent.bar.invite", "en"));
  });
});
