// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ringsState, type RingsInput } from "../src/lib/orb-rings";

const base: RingsInput = { phase: "idle", used: false, inView: true, momentOver: false, bursting: false };
const s = (o: Partial<RingsInput>) => ringsState({ ...base, ...o });

describe("the orb's rings (Hanc's console)", () => {
  it("rest before the authored moment, burst during it, then one soft wave every 7 s", () => {
    expect(s({})).toBe("off");
    expect(s({ bursting: true })).toBe("burst");
    expect(s({ momentOver: true })).toBe("idle");
  });
  it("the idle wave rests while the card is off screen", () => {
    expect(s({ momentOver: true, inView: false })).toBe("away");
  });
  it("busy while connecting, off during a call, whatever else is going on", () => {
    expect(s({ phase: "connecting", bursting: true })).toBe("busy");
    expect(s({ phase: "connecting", used: true })).toBe("busy");
    expect(s({ phase: "live", bursting: true, momentOver: true })).toBe("off");
  });
  it("once the button has been used the invitation is over for good", () => {
    expect(s({ used: true, momentOver: true })).toBe("off");
    expect(s({ used: true, bursting: true })).toBe("off");
  });
});
