// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test doubles */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, vi } from "vitest";
import { HeroFacts } from "@/components/HeroFacts";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactIcon } from "@/components/fact-icons";
import ProductLayout from "@/components/ProductLayout";
import { factPairs, splitLead } from "@/lib/hero";
import { buildSite } from "@/lib/site";
import { FIXTURE_DIR, fixtures } from "./helpers";

const fact = (n: number) => ({ key: `k${n}`, value: `v${n}`, label: `l${n}` });

describe("the key facts in pairs", () => {
  it("are chunked by two, in order: four make two pairs, three a pair and a lone fact, none make none", () => {
    expect(factPairs([1, 2, 3, 4].map(fact)).map((p) => p.map((f) => f.value))).toEqual([["v1", "v2"], ["v3", "v4"]]);
    expect(factPairs([1, 2, 3].map(fact)).map((p) => p.length)).toEqual([2, 1]);
    expect(factPairs([fact(1)]).map((p) => p.length)).toEqual([1]);
    expect(factPairs([])).toEqual([]);
  });

  it("are rendered as lists of two inside the facts block, each fact a value over a label, with the pair's size on it", () => {
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    const out = renderToStaticMarkup(<ProductLayout site={s} />);
    const facts = /<div class="hero__facts" data-reveal="pending">([\s\S]*?)<\/div><\/div><div class="hero__intro-aside">/.exec(out)?.[1] ?? "";
    expect(facts).toMatch(/^<ul class="hero__facts-pair" data-count="2">/);
    expect(facts.match(/<li class="hero__fact" style="--i:\d"><span class="hero__fact-value">[^<]*<\/span><span class="hero__fact-label">(<svg[\s\S]*?<\/svg>)?<span>[^<]*<\/span><\/span><\/li>/g)).toHaveLength(3);
    expect([...facts.matchAll(/data-count="(\d)"/g)].map((m) => m[1])).toEqual(["2", "1"]); // the fixture has three facts
  });
});

describe("the icons before the fact labels", () => {
  const icon = (key: string) => renderToStaticMarkup(<FactIcon factKey={key} />);

  it("exist for the first registration (year), mileage, power and gearbox: inline SVG, the label's colour, aria-hidden, not focusable", () => {
    for (const key of ["year", "mileage", "power", "gearbox"]) {
      const svg = icon(key);
      expect(svg, key).toMatch(/^<svg class="hero__fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
      expect(svg, key).toContain('aria-hidden="true"');
      expect(svg, key).toContain('focusable="false"');
      expect(svg, key).not.toMatch(/<title|aria-label|role=/);
    }
    expect(new Set(["year", "mileage", "power", "gearbox"].map(icon)).size).toBe(4); // four different drawings
  });
  it("are keyed by the spec key: any other key (another product type) has none", () => {
    for (const key of ["fuel", "area", "movement", "", "Year"]) expect(icon(key), key).toBe("");
  });
  it("are before the label inside it, so a wrapped label hangs beside the icon; a fact without an icon has just the text", () => {
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    const out = renderToStaticMarkup(<ProductLayout site={s} />);
    const labels = [...out.matchAll(/<span class="hero__fact-label">([\s\S]*?)<\/span><\/li>/g)].map((m) => m[1]);
    expect(labels.length).toBe(3);
    for (const l of labels) expect(l, l).toMatch(/^(<svg[\s\S]*?<\/svg>)?<span>[^<]+<\/span>$/);
  });
  it("are sized to the label's line (1.3em of its 1.3 line height), never shrunk, in the label's colour", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    expect(/\.hero__fact-icon \{([^}]*)\}/.exec(css)?.[1]).toMatch(/width: 1\.3em;\s*height: 1\.3em/);
    expect(/\.hero__fact-icon \{([^}]*)\}/.exec(css)?.[1]).toMatch(/flex: none/);
    expect(/\.hero__fact-label \{([^}]*)\}/.exec(css)?.[1]).toMatch(/line-height: 1\.3/);
    expect(/\.hero__fact-icon \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/color|fill|stroke/); // it takes the label's colour
  });
});

describe("the description's lead", () => {
  it("is the first sentence, the rest follows after a space: the text is the same", () => {
    expect(splitLead("Volkswagen Multivan (T7) mit sieben Sitzen und 7-Gang-DSG. Technisch in gutem Zustand. Gewartet.")).toEqual({ lead: "Volkswagen Multivan (T7) mit sieben Sitzen und 7-Gang-DSG.", rest: "Technisch in gutem Zustand. Gewartet." });
    const text = "Take over a running lease. Example text!";
    const { lead, rest } = splitLead(text);
    expect(`${lead} ${rest}`).toBe(text);
  });
  it("is all of it when there is only one sentence (with or without a full stop)", () => {
    expect(splitLead("One sentence only.")).toEqual({ lead: "One sentence only.", rest: "" });
    expect(splitLead("No full stop here")).toEqual({ lead: "No full stop here", rest: "" });
    expect(splitLead("")).toEqual({ lead: "", rest: "" });
  });
  it("ends at ! and ? too, and after a closing quote or bracket", () => {
    expect(splitLead("Ready to drive! Call us.")).toEqual({ lead: "Ready to drive!", rest: "Call us." });
    expect(splitLead("Is it free? Yes.").lead).toBe("Is it free?");
    expect(splitLead("It is \"as new.\" Really.").lead).toBe('It is "as new."');
  });
  it("does not end at an abbreviation (a short word or a single letter before the full stop), a number or a sentence that goes on in lower case", () => {
    expect(splitLead("Ca. Zustand sehr gut, 37.500 km gelaufen. Zweite Zeile.").lead).toBe("Ca. Zustand sehr gut, 37.500 km gelaufen.");
    expect(splitLead("Approx. 150 PS and z. B. Diesel. Next.").lead).toBe("Approx. 150 PS and z. B. Diesel.");
    expect(splitLead("Version 2.0 is out. Next.").lead).toBe("Version 2.0 is out.");
    expect(splitLead("It costs 5. then more. Next.").lead).toBe("It costs 5. then more."); // no capital after the first stop: it goes on
    expect(splitLead("Gut gepflegt und neu. Zweiter Satz.").lead).toBe("Gut gepflegt und neu."); // a short word is not an abbreviation
  });
  it("is a span in the description with its style: a little larger, the text colour; the description has the whole column and no hyphenation", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    expect(/\.hero__lead \{([^}]*)\}/.exec(css)?.[1]).toMatch(/color: var\(--text\)/);
    expect(/\.hero__lead \{([^}]*)\}/.exec(css)?.[1]).toMatch(/font-size: 1\.1em/);
    expect(/\.hero__description \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/max-width/);
    expect(/\.hero__description \{([^}]*)\}/.exec(css)?.[1]).toMatch(/hyphens: manual/);
  });
});

describe("the facts' one entrance", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  let observers: { cb: any; el: Element | null; disconnected: boolean }[] = [];
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
    observers = [];
    vi.unstubAllGlobals();
  });
  const mount = async (withObserver = true) => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    if (withObserver) {
      (window as any).IntersectionObserver = class {
        o: { cb: any; el: Element | null; disconnected: boolean; options?: any };
        constructor(cb: any, options?: any) {
          this.o = { cb, el: null, disconnected: false, options };
          observers.push(this.o);
        }
        observe(el: Element) {
          this.o.el = el;
        }
        disconnect() {
          this.o.disconnected = true;
        }
      };
    } else delete (window as any).IntersectionObserver;
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    await act(async () => root!.render(<HeroFacts><ul><li>x</li></ul></HeroFacts>));
    return box.querySelector<HTMLElement>(".hero__facts")!;
  };

  it("starts pending, plays once when the block is on screen, and stops watching", async () => {
    const block = await mount();
    expect(block.dataset.reveal).toBe("pending");
    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBe(block);
    act(() => observers[0].cb([{ isIntersecting: false }]));
    expect(block.dataset.reveal).toBe("pending"); // not yet on screen
    act(() => observers[0].cb([{ isIntersecting: true }]));
    expect(block.dataset.reveal).toBe("in");
    expect(observers[0].disconnected).toBe(true); // once: it never plays again
  });
  it("leaves it to the CSS failsafe (the facts show themselves after 2s) where there is no IntersectionObserver", async () => {
    const block = await mount(false);
    expect(block.dataset.reveal).toBe("pending");
    expect(observers).toHaveLength(0);
  });
  it("renders the children as they are (the server's lists) and the same wrapper class", async () => {
    const block = await mount();
    expect(block.className).toBe("hero__facts");
    expect(block.querySelector("ul > li")?.textContent).toBe("x");
  });

  describe("in the CSS", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const motion = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.hero__facts\[data-reveal="pending"\] \.hero__fact \{([^}]*)\}\s*\.hero__facts\[data-reveal="in"\] \.hero__fact \{([^}]*)\}\s*\}/.exec(css);
    it("hides the facts only where motion is welcome, shifted a little, with a failsafe that shows them after 2s", () => {
      expect(motion).not.toBeNull();
      expect(motion![1]).toMatch(/opacity:\s*0/);
      expect(motion![1]).toMatch(/transform:\s*translateY\(0\.5rem\)/);
      expect(motion![1]).toMatch(/animation:\s*hero-fact-failsafe 1ms linear 2s forwards/);
      expect(css).toMatch(/@keyframes hero-fact-failsafe \{\s*to \{\s*opacity:\s*1;\s*transform:\s*none;/);
      // nothing outside the no-preference block hides a fact
      expect(css.replace(motion![0], "")).not.toMatch(/data-reveal="pending"/);
    });
    it("moves each fact over 400ms with a 60ms stagger by its number, on opacity and transform only (no layout change, no shift)", () => {
      expect(motion![2]).toMatch(/opacity 400ms/);
      expect(motion![2]).toMatch(/transform 400ms/);
      expect(motion![2]).toMatch(/transition-delay:\s*calc\(var\(--i, 0\) \* 60ms\)/);
      expect(motion![2]).not.toMatch(/height|margin|padding|width|top|left/);
    });
    it("numbers the facts in the markup (--i, 0 to 3)", () => {
      const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
      const out = renderToStaticMarkup(<ProductLayout site={s} />);
      expect([...out.matchAll(/<li class="hero__fact" style="--i:(\d)">/g)].map((m) => m[1])).toEqual(["0", "1", "2"]);
    });
  });
});
