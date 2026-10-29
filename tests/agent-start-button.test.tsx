// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- a fake widget element */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStartButton } from "@/components/AgentStartButton";
import { watchCallStatus, type WidgetHost } from "@/lib/hanc-bridge";
import { LANGUAGE_REGISTRY } from "@/lib/languages";
import { ui } from "@/lib/ui-strings";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** A fake widget: an element with a callStatus, a shadow root with its button, and updateComplete. */
function widget({ button = true, status = "idle" }: { button?: boolean; status?: string } = {}) {
  const host = document.createElement("hanc-ai-pill-floating-call") as any;
  host.callStatus = status;
  host.updateComplete = Promise.resolve(true);
  const clicks = vi.fn();
  if (button) {
    const root = host.attachShadow({ mode: "open" });
    const b = document.createElement("button");
    b.setAttribute("part", "pill-button");
    b.addEventListener("click", clicks);
    root.appendChild(b);
  }
  document.body.appendChild(host);
  return { host: host as WidgetHost & Record<string, any>, clicks };
}

describe("AgentStartButton", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    if (!customElements.get("hanc-ai-pill-floating-call")) customElements.define("hanc-ai-pill-floating-call", class extends HTMLElement {});
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    document.body.innerHTML = "";
    vi.useRealTimers();
    localStorage.clear();
  });

  const mount = async (host: WidgetHost | null, extra: { startLabel?: any; endLabel?: any; lang?: "en" | "de" } = {}) => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(createElement(AgentStartButton, { host, lang: extra.lang ?? "en", startLabel: extra.startLabel ?? null, endLabel: extra.endLabel ?? null })));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    return () => box!.querySelector<HTMLButtonElement>(".avatar-card__start")!;
  };
  const tick = (ms = 200) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("becomes the custom button once the widget has rendered its own, labelled in the page language", async () => {
    const { host } = widget();
    const button = await mount(host);
    expect(button().dataset.mode).toBe("custom");
    expect(button().dataset.state).toBe("idle");
    expect(button().textContent).toContain("Start call");
    expect(button().getAttribute("aria-disabled")).toBeNull();
  });

  it("uses the seller's labels when there are some and the standard ones otherwise (de)", async () => {
    const { host } = widget();
    const button = await mount(host, { lang: "de", startLabel: { de: "Mit Sofia sprechen", en: "Talk to Sofia" }, endLabel: { de: "Auflegen", en: "Hang up" } });
    expect(button().textContent).toContain("Mit Sofia sprechen");
    host.callStatus = "connected";
    await tick();
    expect(button().textContent).toContain("Auflegen");
    act(() => root!.unmount());
    root = undefined;
    const second = await mount(widget().host, { lang: "de" });
    expect(second().textContent).toContain("Gespräch starten");
  });

  it("follows the call: connecting (busy, not clickable), connected (end label), error (try again), and back to idle", async () => {
    const { host, clicks } = widget();
    const button = await mount(host);
    host.callStatus = "connecting";
    await tick();
    expect(button().dataset.state).toBe("connecting");
    expect(button().textContent).toContain("Connecting");
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().getAttribute("aria-disabled")).toBe("true");
    act(() => void button().click());
    expect(clicks).not.toHaveBeenCalled();
    host.callStatus = "connected";
    await tick();
    expect(button().dataset.state).toBe("connected");
    expect(button().textContent).toContain("End call");
    host.callStatus = "error";
    await tick();
    expect(button().dataset.state).toBe("error");
    expect(button().textContent).toContain("Try again");
    act(() => void button().click()); // an error can be retried
    expect(clicks).toHaveBeenCalledTimes(1);
    host.callStatus = "idle";
    await tick();
    expect(button().dataset.state).toBe("idle");
  });

  it("starts and ends the call with a click on the widget's own button, and touches no consent", async () => {
    const { host, clicks } = widget();
    const button = await mount(host);
    act(() => void button().click());
    expect(clicks).toHaveBeenCalledTimes(1);
    host.callStatus = "connected";
    await tick();
    act(() => void button().click());
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("privacy_accepted")).toBeNull(); // the widget's consent is the widget's: never written here
    expect(document.querySelector("[class*=privacy], [id*=privacy]")).toBeNull();
  });

  it("falls back to the widget's toggle when its button disappears after upgrade", async () => {
    const { host } = widget();
    const toggle = vi.fn();
    host.toggleCall = toggle;
    const button = await mount(host);
    host.shadowRoot!.innerHTML = ""; // another version of the package re-rendered without the button
    act(() => void button().click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(button().dataset.mode).toBe("custom");
  });

  it("shows the standard pill instead when the widget has no button of its own: mode standard", async () => {
    const button = await mount(widget({ button: false }).host);
    expect(button().dataset.mode).toBe("standard");
    expect(button().getAttribute("aria-disabled")).toBe("true");
  });

  it("goes to standard when a click finds neither the button nor the toggle", async () => {
    const { host } = widget();
    const button = await mount(host);
    host.shadowRoot!.innerHTML = "";
    act(() => void button().click());
    expect(button().dataset.mode).toBe("standard");
  });

  it("stays pending without a widget element, and has an accessible name and a status for screen readers", async () => {
    const button = await mount(null);
    expect(button().dataset.mode).toBe("pending");
    expect(button().tagName).toBe("BUTTON");
    expect(button().type).toBe("button");
    expect(button().textContent).toContain("Start call"); // the accessible name is its text
    expect(button().querySelector('[role="status"]')).toBeNull(); // not inside the button: its name stays its label
    expect(box!.querySelector('[role="status"]')).not.toBeNull();
  });

  it("stops polling when it unmounts", async () => {
    const { host } = widget();
    await mount(host);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root!.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("watchCallStatus", () => {
  it("reports the status now and each change, reads at once at call-start and call-end, and stops", () => {
    vi.useFakeTimers();
    const host = document.createElement("div") as any;
    host.callStatus = "idle";
    const seen: string[] = [];
    const stop = watchCallStatus(host, (s) => seen.push(s), 100);
    expect(seen).toEqual(["idle"]);
    host.callStatus = "connecting";
    vi.advanceTimersByTime(100);
    host.callStatus = "connected";
    host.dispatchEvent(new Event("call-start")); // no waiting for the next tick
    host.callStatus = "idle";
    host.dispatchEvent(new Event("call-end"));
    expect(seen).toEqual(["idle", "connecting", "connected", "idle"]);
    stop();
    host.callStatus = "error";
    vi.advanceTimersByTime(1000);
    expect(seen).toHaveLength(4);
    vi.useRealTimers();
  });
});

describe("the state labels fit the button", () => {
  it("connecting and error are short in every language, so no state needs a second line", () => {
    for (const { code } of LANGUAGE_REGISTRY) {
      expect(ui("agent.connecting", code).length, `connecting ${code}`).toBeLessThanOrEqual(16);
      expect(ui("agent.error", code).length, `error ${code}`).toBeLessThanOrEqual(26);
    }
    expect(ui("agent.connecting", "de")).toBe("Verbinde...");
    expect(ui("agent.error", "de")).toBe("Fehlgeschlagen. Nochmal?");
    expect(ui("agent.connecting", "en")).toBe("Connecting...");
    expect(ui("agent.error", "en")).toBe("Failed. Try again");
  });
});
