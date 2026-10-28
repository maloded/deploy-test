// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
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
    expect(r.ok && r.seller.agent).toEqual({ id: ID, variant: "inline", placement: "bottom", voiceServiceUrl: "https://voice.hanc.ai" });
  });
  it("placement defaults to bottom; top without a variant means the pill, an explicit variant wins", () => {
    const parse = (agent: unknown) => {
      const r = validateSeller({ ...fixtures.sellerJson(), agent });
      return r.ok ? r.seller.agent : null;
    };
    expect(parse({ id: ID, placement: "top" })).toMatchObject({ placement: "top", variant: "pill" });
    expect(parse({ id: ID, placement: "top", variant: "inline" })).toMatchObject({ placement: "top", variant: "inline" });
    expect(parse({ id: ID, variant: "pill" })).toMatchObject({ placement: "bottom", variant: "pill" });
    expect(parse({ id: ID, placement: "bottom" })).toMatchObject({ variant: "inline" });
  });
  it("refuses an unknown placement or variant and names the allowed values", () => {
    const placement = issues({ id: ID, placement: "middle" }).join("\n");
    expect(placement).toMatch(/^agent\.placement/m);
    expect(placement).toContain('"top"');
    expect(placement).toContain('"bottom"');
    expect(placement).toContain('"header"');
    const variant = issues({ id: ID, variant: "banner" }).join("\n");
    for (const v of ["inline", "pill", "floating"]) expect(variant).toContain(`"${v}"`);
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
  const parsed = (agent: Record<string, unknown>) => {
    const r = validateSeller({ ...fixtures.sellerJson(), agent });
    if (!r.ok) throw new Error(r.issues.join());
    return r.seller.agent;
  };
  const order = (html: string, marks: string[]) => marks.map((m) => html.indexOf(m));

  it("placement top: the strip is after the header and before the hero (and the hero's one-screen height knows about it); the bottom strip is not there", async () => {
    const site = withAgent(parsed({ id: ID, placement: "top" }), "en");
    const html = renderToStaticMarkup(<ProductLayout site={site} />);
    const [header, strip, main, hero] = order(html, ["<header", 'class="agent-strip agent-strip--top"', "<main", 'id="hero"']);
    expect([header, strip, main, hero].every((i) => i >= 0)).toBe(true);
    expect(header).toBeLessThan(strip);
    expect(strip).toBeLessThan(main);
    expect(main).toBeLessThan(hero);
    expect(html).toContain(ui("agent.top", "en"));
    expect(html.match(/agent-strip /g) ?? []).toHaveLength(1); // one strip only
    expect(html).toContain("--agent-top-h:3.5rem");
    expect(html).not.toContain("agent-strip__heading");
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/min-height: calc\(100svh - var\(--header-h, 4\.25rem\) - var\(--agent-top-h, 0rem\)\)/);
    expect(css).not.toMatch(/\.agent-strip[^{]*\{[^}]*position: (fixed|sticky)/);
    await mount(site);
    const el = box!.querySelector("hanc-ai-pill-call")!;
    expect(box!.querySelector(".agent-strip--top")!.nextElementSibling?.matches("main")).toBe(true);
    expect(el.getAttribute("agent-id")).toBe(ID);
  });

  it("placement bottom (the default) keeps the strip above the footer, with its heading, and no top strip", () => {
    const html = renderToStaticMarkup(<ProductLayout site={withAgent(parsed({ id: ID }))} />);
    expect(html).not.toContain("agent-strip--top");
    expect(html).not.toContain("--agent-top-h");
    const [main, strip, footer] = order(html, ["</main>", 'class="agent-strip"', "<footer"]);
    expect(main).toBeLessThan(strip);
    expect(strip).toBeLessThan(footer);
    expect(html).toContain(ui("agent.heading", "en"));
  });

  it("placement header: accepted, and the pill is the default variant", () => {
    expect(parsed({ id: ID, placement: "header" })).toMatchObject({ placement: "header", variant: "pill" });
    expect(parsed({ id: ID, placement: "header", variant: "inline" })).toMatchObject({ placement: "header", variant: "inline" });
  });

  it("placement header: no header button and no strip; label and widget are inside the header; the form is still reachable through other #contact buttons", async () => {
    const site = withAgent(parsed({ id: ID, placement: "header" }), "de");
    const html = renderToStaticMarkup(<ProductLayout site={site} />);
    const header = /<header[\s\S]*?<\/header>/.exec(html)![0];
    expect(header).not.toContain("button");
    expect(header).not.toContain("#contact");
    expect(header).not.toContain(ui("header.cta", "de"));
    expect(header).toContain(ui("agent.ask", "de"));
    expect(header).toContain("site-header__widget");
    expect(html).not.toContain("agent-strip");
    expect(html).toContain("--header-h:5.5rem");
    expect(header.indexOf("lang-switch")).toBeLessThan(header.indexOf(ui("agent.ask", "de"))); // order: language, label, widget
    expect(header.indexOf(ui("agent.ask", "de"))).toBeLessThan(header.indexOf("site-header__widget"));
    const outside = html.replace(header, "");
    expect(outside).toMatch(/<a [^>]*href="#contact"/); // the hero and offer buttons stay
    await mount(site);
    const el = box!.querySelector("header hanc-ai-pill-call")!;
    expect(el.getAttribute("agent-id")).toBe(ID);
    expect(box!.querySelector("header a[href='#contact']")).toBeNull();
    expect(box!.querySelectorAll("a[href='#contact']").length).toBeGreaterThan(0);
  });

  it("the header keeps its button without the header placement, and with the header placement for inline (bottom strip) and floating", () => {
    const cta = ui("header.cta", "en");
    const html = (agent: Record<string, unknown>) => renderToStaticMarkup(<ProductLayout site={withAgent(parsed(agent))} />);
    for (const agent of [{ id: ID }, { id: ID, placement: "top" }, { id: ID, placement: "header", variant: "inline" }, { id: ID, placement: "header", variant: "floating" }]) {
      const h = html(agent);
      expect(/<header[\s\S]*?<\/header>/.exec(h)![0], JSON.stringify(agent)).toContain(cta);
      expect(h).not.toContain("--header-h");
    }
    expect(html({ id: ID, placement: "header", variant: "inline" })).toContain('class="agent-strip"'); // inline behaves as bottom
    expect(html({ id: ID, placement: "header", variant: "floating" })).not.toContain("agent-strip");
  });

  it("the hero follows the header: both use --header-h, and wide windows fix the header's height to it", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/min-height: calc\(100svh - var\(--header-h, 4\.25rem\)/);
    expect(css).toMatch(/\.site-header--agent \{\s*height: var\(--header-h, 4\.25rem\);/);
    expect(css).toMatch(/\.site-header__widget \{[^}]*min-height: 3\.75rem/);
  });

  it("the floating variant ignores placement: no strip, no top space", () => {
    const html = renderToStaticMarkup(<ProductLayout site={withAgent(parsed({ id: ID, variant: "floating", placement: "top" }))} />);
    expect(html).not.toContain("agent-strip");
    expect(html).not.toContain("--agent-top-h");
  });

  it("pill variant: <hanc-ai-pill-call> with the inline variant's attributes, the button texts from the UI strings and a small orb", async () => {
    await mount(withAgent(parsed({ id: ID, variant: "pill", theme: "emerald" }), "de"));
    const el = box!.querySelector("hanc-ai-pill-call")!;
    expect(el.getAttribute("agent-id")).toBe(ID);
    expect(el.getAttribute("theme")).toBe("emerald");
    expect(el.getAttribute("voice-service-url")).toBe("https://voice.hanc.ai");
    expect(el.getAttribute("button-start-text")).toBe(ui("agent.pill", "de"));
    expect(el.getAttribute("button-end-text")).toBe(ui("agent.end", "de"));
    expect(el.getAttribute("button-connecting-text")).toBe(ui("agent.connecting", "de"));
    expect(el.getAttribute("orb-size")).toBe("36");
    expect(el.hasAttribute("size")).toBe(false);
    expect(box!.querySelector("hanc-ai-inline-call")).toBeNull();
  });

  it("top with the inline widget is allowed: a small orb in the strip, a taller reserved height", async () => {
    const site = withAgent(parsed({ id: ID, placement: "top", variant: "inline" }));
    expect(renderToStaticMarkup(<ProductLayout site={site} />)).toContain("--agent-top-h:7rem");
    await mount(site);
    expect(box!.querySelector(".agent-strip--top hanc-ai-inline-call")!.getAttribute("size")).toBe("100");
  });

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
