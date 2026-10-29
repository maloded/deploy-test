// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentState } from "@/components/use-agent-state";
import { agentStateOf, nextCardState, type CardState } from "@/lib/agent-state";
import { fakeWidget } from "./fake-widget";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("nextCardState", () => {
  const run = (signals: Parameters<typeof nextCardState>[1][], from: CardState = "idle") => signals.reduce(nextCardState, from);
  const state = (s: string) => ({ kind: "agent-state", state: s }) as const;

  it("a call starts on the listening picture and ends on idle", () => {
    expect(run([{ kind: "call-start" }])).toBe("call");
    expect(run([{ kind: "call-start" }, { kind: "call-end" }])).toBe("idle");
  });

  it("speaking and back, through listening and thinking", () => {
    expect(run([{ kind: "call-start" }, state("speaking")])).toBe("speaking");
    expect(run([{ kind: "call-start" }, state("speaking"), state("listening")])).toBe("call");
    expect(run([{ kind: "call-start" }, state("speaking"), state("thinking")])).toBe("call");
    expect(run([{ kind: "call-start" }, state("speaking"), state("idle")])).toBe("call");
  });

  it("call-end wins from every state, and a late agent_state after it does nothing", () => {
    expect(run([{ kind: "call-end" }], "speaking")).toBe("idle");
    expect(run([{ kind: "call-start" }, state("speaking"), { kind: "call-end" }, state("speaking")])).toBe("idle");
  });

  it("an agent_state outside a call or with an unknown value is ignored", () => {
    expect(run([state("speaking")])).toBe("idle");
    expect(run([{ kind: "call-start" }, state("dancing")])).toBe("call");
    expect(run([{ kind: "call-start" }, state("speaking"), state("dancing")])).toBe("speaking");
  });

  it("a second call-start in a call keeps the call (not speaking)", () => {
    expect(run([{ kind: "call-start" }, state("speaking"), { kind: "call-start" }])).toBe("call");
  });
});

describe("agentStateOf", () => {
  it("reads only agent_state commands", () => {
    expect(agentStateOf({ type: "agent_state", payload: { state: "speaking" } })).toBe("speaking");
    expect(agentStateOf({ type: "set_emotion", payload: { state: "speaking" } })).toBeNull();
    expect(agentStateOf({ type: "agent_state", payload: {} })).toBeNull();
    expect(agentStateOf({ type: "agent_state", payload: null })).toBeNull();
    expect(agentStateOf({ type: "agent_state", payload: { state: 3 } })).toBeNull();
    expect(agentStateOf(undefined)).toBeNull();
    expect(agentStateOf("agent_state")).toBeNull();
  });
});

describe("useAgentState on the document", () => {
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });
  const mount = () => {
    function Probe() {
      return <output data-state={useAgentState()} />;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Probe />));
    return () => host.querySelector("output")!.getAttribute("data-state");
  };

  it("follows call-start, agent_state, call-end", () => {
    const state = mount();
    const widget = fakeWidget();
    expect(state()).toBe("idle");
    act(() => void widget.element.dispatchEvent(new Event("call-start", { bubbles: true, composed: true })));
    expect(state()).toBe("call");
    act(() => void widget.command("agent_state", { state: "speaking" }));
    expect(state()).toBe("speaking");
    act(() => void widget.command("agent_state", { state: "listening" }));
    expect(state()).toBe("call");
    act(() => void widget.element.dispatchEvent(new Event("call-end", { bubbles: true, composed: true })));
    expect(state()).toBe("idle");
  });

  it("without any agent_state the card stays on the call picture for the whole call", () => {
    const state = mount();
    const widget = fakeWidget();
    act(() => void widget.element.dispatchEvent(new Event("call-start", { bubbles: true, composed: true })));
    act(() => void widget.command("navigate", { path: "/" })); // other commands pass by
    act(() => void widget.command("page_context"));
    expect(state()).toBe("call");
  });

  it("only listens: it never handles or answers a command", () => {
    mount();
    const widget = fakeWidget();
    const call = widget.command("agent_state", { state: "speaking" });
    expect(call.handled).toBe(false);
    expect(call.answers).toEqual([]);
  });

  it("removes its three listeners when it unmounts", () => {
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    mount();
    const mine = added.mock.calls.filter(([type]) => ["call-start", "call-end", "agent-command"].includes(type));
    expect(mine).toHaveLength(3);
    act(() => root!.unmount());
    root = null;
    for (const [type, handler] of mine) expect(removed).toHaveBeenCalledWith(type, handler);
    vi.restoreAllMocks();
  });
});
