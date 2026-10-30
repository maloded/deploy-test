// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAvatarCard } from "@/components/AgentAvatarCard";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { roleLine } from "@/lib/avatar-view";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("hanc-webrtc-widgets", () => ({}));

const PACK: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: { en: "Sales advisor", de: "Verkaufsberaterin" }, languages: ["de", "en"], example: null, liveText: null };

describe("the job line's text", () => {
  it("is the role and the languages' names, or their codes for a card too narrow for them", () => {
    expect(roleLine(PACK, "de")).toBe("Verkaufsberaterin · Deutsch, English");
    expect(roleLine(PACK, "de", true)).toBe("Verkaufsberaterin · DE, EN");
    expect(roleLine({ ...PACK, role: null }, "en", true)).toBe("DE, EN");
    expect(roleLine({ ...PACK, languages: [] }, "en", true)).toBe("Sales advisor");
  });
});

describe("the job line on the card stays on one line", () => {
  let root: Root | undefined;
  let room = 0;
  const need = { full: 235, short: 170 };
  beforeEach(() => {
    (window as any).requestIdleCallback = (cb: () => void) => (cb(), 1);
    (window as any).cancelIdleCallback = () => {};
    (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    // the line has `room` px; the hidden copy that measures a text is as wide as the text would be
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => room });
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const w = this.style.position === "absolute" && this.style.visibility === "hidden" ? (this.textContent!.includes("Deutsch") ? need.full : need.short) : 100;
      return { left: 0, top: 0, width: w, height: 10, right: w, bottom: 10, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });
  const mount = async (width: number) => {
    room = width;
    const box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<AgentAvatarCard avatar={PACK} lang="de" placement="hero">x</AgentAvatarCard>));
    return document.querySelector(".avatar-card__role")!.textContent;
  };

  it("shows the languages' names where they fit", async () => {
    expect(await mount(300)).toBe("Verkaufsberaterin · Deutsch, English");
  });
  it("shows their codes where the names would wrap (a card about 390px wide)", async () => {
    expect(await mount(189)).toBe("Verkaufsberaterin · DE, EN");
  });
  it("keeps the names when the line is not laid out (no room measured)", async () => {
    expect(await mount(0)).toBe("Verkaufsberaterin · Deutsch, English");
  });
});
