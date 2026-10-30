// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NO_CALL, callAttribute, nextOutcome, type Outcome } from "../src/lib/call-outcome";
import type { CallStatus } from "../src/lib/hanc-bridge";

const run = (statuses: CallStatus[], from: Outcome = NO_CALL) => statuses.reduce(nextOutcome, from).phase;

describe("what a call attempt came to (the Hanc role hero's call state)", () => {
  it("idle, connecting, live", () => {
    expect(run([])).toBe("idle");
    expect(run(["connecting"])).toBe("connecting");
    expect(run(["connecting", "connected"])).toBe("live");
  });
  it("an ordinary end goes back to idle", () => {
    expect(run(["connecting", "connected", "idle"])).toBe("idle");
  });
  it("an attempt that falls back to idle or error without connecting FAILED, and stays failed until the next attempt", () => {
    expect(run(["connecting", "idle"])).toBe("failed");
    expect(run(["connecting", "error"])).toBe("failed");
    expect(run(["connecting", "error", "idle", "idle", "idle"])).toBe("failed"); // the widget resets itself underneath
    expect(run(["connecting", "idle", "connecting"])).toBe("connecting");
    expect(run(["connecting", "idle", "connecting", "connected"])).toBe("live");
  });
  it("an error after a connection is a dropped call, which also stays", () => {
    expect(run(["connecting", "connected", "error"])).toBe("dropped");
    expect(run(["connecting", "connected", "error", "idle"])).toBe("dropped");
    expect(run(["connecting", "connected", "error", "connecting"])).toBe("connecting");
  });
  it("an error with no attempt before it is a failure", () => {
    expect(run(["error"])).toBe("failed");
  });
  it("data-call: what the ring and the example key on", () => {
    expect(["idle", "connecting", "live", "failed", "dropped"].map((p) => callAttribute(p as never))).toEqual(["idle", "connecting", "connected", "error", "error"]);
  });
});
