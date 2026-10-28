// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { validateSeller } from "@/lib/seller";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock("hanc-webrtc-widgets", () => {
  loaded.count++;
  return {};
});

const ID = "test-agent-id";
const base = () => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
const withAgent = (agent: Record<string, unknown> | undefined, lang: "de" | "en" = "en") => {
  const site = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  return { ...site, seller: { ...site.seller, agent } as any };
};
const issues = (agent: unknown) => {
  const r = validateSeller({ ...fixtures.sellerJson(), agent });
  return r.ok ? [] : r.issues;
};

let root: Root | undefined;
let box: HTMLDivElement | undefined;
function mount(site: ReturnType<typeof withAgent>) {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  return act(async () => root!.render(<ProductLayout site={site} />));
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
});

describe("agent object in seller.json", () => {
  it("is optional, and the defaults are inline and the Hanc voice service", () => {
    expect(validateSeller(fixtures.sellerJson()).ok).toBe(true);
    const r = validateSeller({ ...fixtures.sellerJson(), agent: { id: ID } });
    expect(r.ok && r.seller.agent).toEqual({ id: ID, variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" });
  });
  it("accepts a floating variant, a theme and an https voice service, and refuses the rest", () => {
    expect(issues({ id: ID, variant: "floating", theme: "emerald", voiceServiceUrl: "https://voice.example.invalid" })).toEqual([]);
    expect(issues({ id: ID, variant: "banner" }).join()).toMatch(/^agent\.variant/m);
    expect(issues({ id: ID, voiceServiceUrl: "http://voice.example.invalid" }).join()).toMatch(/agent\.voiceServiceUrl/);
    expect(issues({ id: "bad id<" }).join()).toMatch(/agent\.id/);
    expect(issues({ variant: "inline" }).join()).toMatch(/agent\.id/);
    expect(issues({ id: ID, secret: "x" }).length).toBeGreaterThan(0);
  });
});

describe("widget mounting", () => {
  it("without an agent: nothing in the markup, the package is never imported, no widget element", async () => {
    const before = loaded.count;
    await mount(withAgent(undefined));
    expect(box!.querySelector("[data-block=agent]")).toBeNull();
    expect(box!.querySelector("[class*=agent-]")).toBeNull();
    expect(document.querySelector("hanc-ai-inline-call, hanc-ai-pill-floating-call")).toBeNull();
    expect(loaded.count).toBe(before);
    expect(renderToStaticMarkup(<ProductLayout site={base()} />)).not.toMatch(/agent|hanc/i);
  });

  it("inline: the strip with the heading is in the server markup, the element only after the package loaded in the browser", async () => {
    const html = renderToStaticMarkup(<ProductLayout site={withAgent({ id: ID, variant: "inline", voiceServiceUrl: "https://voice.hanc.ai" })} />);
    expect(html).toContain(ui("agent.heading", "en"));
    expect(html).not.toContain("hanc-ai-");
    expect(html).not.toContain(ID);
    await mount(withAgent({ id: ID, variant: "inline", theme: "emerald", voiceServiceUrl: "https://voice.hanc.ai" }, "de"));
    const el = box!.querySelector("hanc-ai-inline-call")!;
    expect(el.getAttribute("agent-id")).toBe(ID);
    expect(el.getAttribute("theme")).toBe("emerald");
    expect(el.getAttribute("voice-service-url")).toBe("https://voice.hanc.ai");
    expect(el.getAttribute("button-start-text")).toBe(ui("agent.start", "de"));
    expect(box!.querySelector(".agent-strip__heading")!.textContent).toBe(ui("agent.heading", "de"));
    // the strip sits between the page content and the footer
    const strip = box!.querySelector(".agent-strip")!;
    expect(strip.nextElementSibling?.matches("footer")).toBe(true);
  });

  it("floating: no strip and no heading, the pill element, room kept below the footer's last line", async () => {
    await mount(withAgent({ id: ID, variant: "floating", voiceServiceUrl: "https://voice.hanc.ai" }));
    expect(box!.querySelector(".agent-strip")).toBeNull();
    expect(box!.textContent).not.toContain(ui("agent.heading", "en"));
    const el = box!.querySelector("hanc-ai-pill-floating-call")!;
    expect(el.getAttribute("agent-id")).toBe(ID);
    expect(el.getAttribute("theme")).toBeNull(); // no theme configured: the attribute is left out
    expect(box!.querySelector("footer")!.className).toContain("site-footer--agent-floating");
  });
});
