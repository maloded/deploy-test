// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- a fake widget element and a fake room */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callStatusOf, findWidget, pillButtonOf, speechFromAttribute, toggleCall, watchAgentSpeech, whenWidgetReady, type AgentSpeechState, type WidgetHost } from "@/lib/hanc-bridge";

/** A fake LiveKit-like room: remote participants with attributes, and the on/off of an event emitter. */
function fakeRoom(participants: Record<string, Record<string, string>> = {}) {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  return {
    remoteParticipants: new Map(Object.entries(participants).map(([id, attributes]) => [id, { attributes }])),
    on: (e: string, l: (...a: unknown[]) => void) => (listeners.get(e) ?? listeners.set(e, new Set()).get(e)!).add(l),
    off: (e: string, l: (...a: unknown[]) => void) => listeners.get(e)?.delete(l),
    count: (e: string) => listeners.get(e)?.size ?? 0,
    emit: (e: string, ...args: unknown[]) => listeners.get(e)?.forEach((l) => l(...args)),
  };
}

function fakeHost(extra: Record<string, unknown> = {}): WidgetHost & Record<string, any> {
  const host = document.createElement("hanc-ai-pill-floating-call") as any;
  Object.assign(host, extra);
  document.body.appendChild(host);
  return host;
}
const withButton = (host: HTMLElement) => {
  const root = host.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.setAttribute("part", "pill-button");
  root.appendChild(button);
  return button;
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("speechFromAttribute", () => {
  it("speaking is speaking; listening, thinking, idle, initializing and anything else is listening during a call", () => {
    expect(speechFromAttribute("speaking")).toBe("speaking");
    for (const v of ["listening", "thinking", "idle", "initializing", "", "whatever", undefined]) expect(speechFromAttribute(v as string | undefined)).toBe("listening");
  });
});

describe("callStatusOf, findWidget, pillButtonOf", () => {
  it("reads the status and treats anything unknown as idle", () => {
    for (const s of ["connecting", "connected", "error", "idle"]) expect(callStatusOf(fakeHost({ callStatus: s }))).toBe(s);
    expect(callStatusOf(fakeHost({ callStatus: "disconnecting" }))).toBe("idle");
    expect(callStatusOf(fakeHost())).toBe("idle");
  });
  it("finds the element and its button", () => {
    const host = fakeHost();
    expect(findWidget(document)).toBe(host);
    expect(pillButtonOf(host)).toBeNull();
    const button = withButton(host);
    expect(pillButtonOf(host)).toBe(button);
    expect(findWidget(document.createElement("div"))).toBeNull();
  });
});

describe("toggleCall", () => {
  it("clicks the widget's own button", () => {
    const host = fakeHost({ toggleCall: vi.fn() });
    const clicks = vi.fn();
    withButton(host).addEventListener("click", clicks);
    expect(toggleCall(host)).toBe(true);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(host.toggleCall).not.toHaveBeenCalled();
  });
  it("falls back to the widget's toggle without the button, and reports false without either", () => {
    const toggle = vi.fn();
    expect(toggleCall(fakeHost({ toggleCall: toggle }))).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggleCall(fakeHost())).toBe(false);
  });
});

describe("whenWidgetReady", () => {
  it("is true once the element is rendered with its button, false without the button or when the element is never defined", async () => {
    const host = fakeHost({ updateComplete: Promise.resolve(true) });
    withButton(host);
    customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
    expect(await whenWidgetReady(host, 50)).toBe(true);
    expect(await whenWidgetReady(fakeHost({ updateComplete: Promise.resolve(true) }), 50)).toBe(false);
    expect(await whenWidgetReady(fakeHost({ updateComplete: Promise.reject(new Error("x")) }), 50)).toBe(false);
  });
});

describe("watchAgentSpeech", () => {
  const record = (host: WidgetHost, options?: { pollMs?: number; giveUpMs?: number }) => {
    const seen: AgentSpeechState[] = [];
    const stop = watchAgentSpeech(host, (s) => seen.push(s), options);
    return { seen, stop };
  };
  const start = (host: HTMLElement) => host.dispatchEvent(new Event("call-start", { bubbles: true, composed: true }));
  const end = (host: HTMLElement) => host.dispatchEvent(new Event("call-end", { bubbles: true, composed: true }));

  beforeEach(() => vi.useFakeTimers());

  it("says nothing before a call, listening at the start of one and idle at its end", () => {
    const host = fakeHost();
    const { seen } = record(host);
    expect(seen).toEqual([]);
    start(host);
    expect(seen).toEqual(["listening"]);
    end(host);
    expect(seen).toEqual(["listening", "idle"]);
  });

  it("reads the agent's existing state first, found by the attribute and not by the participant's identity, then follows the changes", () => {
    const room = fakeRoom({ "someone-else": { name: "visitor" }, "whatever-id-123": { "lk.agent.state": "speaking" } });
    const host = fakeHost({ callManager: { room } });
    const { seen } = record(host);
    start(host);
    expect(seen).toEqual(["listening", "speaking"]);
    room.emit("participantAttributesChanged", { "lk.agent.state": "thinking" }, { attributes: { "lk.agent.state": "thinking" } });
    room.emit("participantAttributesChanged", { "lk.agent.state": "speaking" }, { attributes: { "lk.agent.state": "speaking" } });
    room.emit("participantAttributesChanged", { other: "x" }, { attributes: { other: "x" } }); // not the agent's state: ignored
    expect(seen).toEqual(["listening", "speaking", "listening", "speaking"]);
  });

  it("waits for the room for up to the give-up time after the call starts", () => {
    const host = fakeHost({ callManager: { room: null } });
    const { seen } = record(host, { pollMs: 100, giveUpMs: 1000 });
    start(host);
    vi.advanceTimersByTime(400);
    const room = fakeRoom({ agent: { "lk.agent.state": "speaking" } });
    host.callManager = { room };
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(["listening", "speaking"]);
    expect(room.count("participantAttributesChanged")).toBe(1);
  });

  it("stays on listening for the whole call when there is no room, and stops looking after the give-up time", () => {
    const host = fakeHost({ callManager: { room: undefined } });
    const { seen } = record(host, { pollMs: 100, giveUpMs: 500 });
    start(host);
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(["listening"]);
    host.callManager = { room: fakeRoom({ a: { "lk.agent.state": "speaking" } }) }; // too late: not looked for any more
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(["listening"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unsubscribes from the room at the call's end and when stopped, and reports idle once", () => {
    const room = fakeRoom({ agent: { "lk.agent.state": "listening" } });
    const host = fakeHost({ callManager: { room } });
    const { seen, stop } = record(host);
    start(host);
    expect(room.count("participantAttributesChanged")).toBe(1);
    end(host);
    expect(room.count("participantAttributesChanged")).toBe(0);
    room.emit("participantAttributesChanged", {}, { attributes: { "lk.agent.state": "speaking" } });
    expect(seen).toEqual(["listening", "listening", "idle"]);
    start(host);
    expect(room.count("participantAttributesChanged")).toBe(1);
    stop();
    expect(room.count("participantAttributesChanged")).toBe(0);
    end(host); // stopped: no more reports
    expect(seen.filter((s) => s === "idle")).toHaveLength(1);
  });

  it("a second call starts clean: one subscription, never two", () => {
    const room = fakeRoom({ agent: { "lk.agent.state": "listening" } });
    const host = fakeHost({ callManager: { room } });
    record(host);
    start(host);
    start(host);
    expect(room.count("participantAttributesChanged")).toBe(1);
  });

  it("starts at once when the card mounts during a call", () => {
    const host = fakeHost({ callStatus: "connected", callManager: { room: fakeRoom({ agent: { "lk.agent.state": "speaking" } }) } });
    const { seen } = record(host);
    expect(seen).toEqual(["listening", "speaking"]);
  });

  it("only reads: it never writes to the room or the participants", () => {
    const room = fakeRoom({ agent: { "lk.agent.state": "speaking" } });
    const frozen = Object.freeze({ ...room, remoteParticipants: new Map([["agent", Object.freeze({ attributes: Object.freeze({ "lk.agent.state": "speaking" }) })]]) });
    const host = fakeHost({ callManager: Object.freeze({ room: frozen }) });
    const { seen } = record(host);
    expect(() => start(host)).not.toThrow();
    expect(seen).toEqual(["listening", "speaking"]);
  });
});
