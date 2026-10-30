// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "@/components/Header";
import { LANGUAGE_MENU_FROM, LanguageSwitcher } from "@/components/LanguageSwitcher";
import { buildSite } from "@/lib/site";
import { ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const two = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("the header's language switcher", () => {
  it("is absent when the seller offers one language", () => {
    const one = { ...two("en"), product: { ...two("en").product, languages: ["en" as const] } };
    expect(html(<Header site={one} />)).not.toContain("lang-switch");
    expect(html(<Header site={one} />)).toContain("site-header__name");
  });

  it("is present for two languages: a nav named from the UI strings, native names, aria-current on the active one", () => {
    for (const lang of ["de", "en"] as const) {
      const out = html(<Header site={two(lang)} />);
      expect(out).toContain(`<nav class="lang-switch" aria-label="${ui("lang.switch", lang)}">`);
      const links = [...out.matchAll(/<a href="([^"]+)" lang="(\w+)" hrefLang="\w+"( aria-current="true")?>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], code: m[2], current: Boolean(m[3]), name: m[4] }));
      expect(links.map((l) => l.name).sort()).toEqual(["Deutsch", "English"]);
      expect(links.map((l) => l.href).sort()).toEqual(["/de", "/en"]);
      expect(links.filter((l) => l.current).map((l) => l.code)).toEqual([lang]);
    }
  });

  it("labels the nav differently per language", () => {
    expect(ui("lang.switch", "de")).not.toBe(ui("lang.switch", "en"));
  });

  it("keeps the header's other content (brand and the contact button)", () => {
    const out = html(<Header site={two("de")} />);
    expect(out).toContain(two("de").seller.displayName);
    expect(out).toContain(`href="#contact"`);
  });
});

describe("the switcher keeps the #fragment", () => {
  let root: Root;
  let box: HTMLDivElement;
  afterEach(() => {
    act(() => root.unmount());
    box.remove();
    window.location.hash = "";
  });

  it("adds the current hash to every link, and follows hashchange", () => {
    window.location.hash = "#specs";
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root.render(<LanguageSwitcher languages={["en", "de"]} current="en" label="Language" />));
    const hrefs = () => [...box.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs()).toEqual(["/en#specs", "/de#specs"]);
    act(() => {
      window.location.hash = "#gallery-3";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(hrefs()).toEqual(["/en#gallery-3", "/de#gallery-3"]);
  });

  it("renders working /<lang> links without JavaScript", () => {
    const out = html(<LanguageSwitcher languages={["en", "de"]} current="de" label="Language" />);
    expect(out).toContain('href="/en"');
    expect(out).toContain('href="/de"');
  });
});

describe("the switcher's styles use theme variables only", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (selector: string) => new RegExp(`${selector.replace(/[.[\]"=()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("has no literal colours or fonts; colours come from the theme", () => {
    for (const sel of [".lang-switch", ".lang-switch a", '.lang-switch a[aria-current="true"]', ".site-header__end"]) {
      const body = block(sel);
      expect(body, sel).not.toBe("");
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-family|border-radius:\s*[\d.]+(px|rem)/i);
    }
    expect(block(".lang-switch a")).toContain("var(--muted)");
    expect(block('.lang-switch a[aria-current="true"]')).toContain("var(--accent-line, var(--accent))");
  });
});

// A registry that exists only in this file: no real language is added to the template or to any content.
const FAKE = [
  { code: "aa", name: "Aaland" },
  { code: "bb", name: "Бебе" },
  { code: "cc", name: "Çeçe" },
  { code: "dd", name: "Dëdé" },
] as const;
const fake = (n: number) => FAKE.slice(0, n);
const codes = (n: number) => fake(n).map((l) => l.code);

describe("how many languages decide the control (a fake registry of 1, 2 and 4)", () => {
  it("the threshold is a constant: 3", () => {
    expect(LANGUAGE_MENU_FROM).toBe(3);
  });

  it("1 language: nothing at all", () => {
    expect(html(<LanguageSwitcher languages={codes(1)} current="aa" label="Language" registry={fake(1)} />)).toBe("");
  });

  it("2 languages: the two text links, as before, no dropdown", () => {
    const out = html(<LanguageSwitcher languages={codes(2)} current="bb" label="Language" registry={fake(2)} />);
    expect(out).toContain('<nav class="lang-switch" aria-label="Language">');
    expect(out).not.toMatch(/<details|<summary|lang-menu/);
    expect(out).toContain('<a href="/aa" lang="aa" hrefLang="aa">Aaland</a>');
    expect(out).toContain('<a href="/bb" lang="bb" hrefLang="bb" aria-current="true">Бебе</a>');
  });

  it("4 languages: one dropdown that shows the current language's own name, in a nav, with a real link to every language", () => {
    const out = html(<LanguageSwitcher languages={codes(4)} current="cc" label="Language" registry={fake(4)} />);
    expect(out).toContain('<nav class="lang-switch lang-switch--menu" aria-label="Language">');
    expect(out).toContain('<summary class="lang-menu__current" aria-label="Language: Çeçe"><span lang="cc">Çeçe</span></summary>');
    expect(out).not.toMatch(/<select/);
    const links = [...out.matchAll(/<a href="([^"]+)" lang="(\w+)" hrefLang="(\w+)"( aria-current="true")?>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], lang: m[2], hreflang: m[3], current: Boolean(m[4]), name: m[5] }));
    expect(links.map((l) => l.href)).toEqual(["/aa", "/bb", "/cc", "/dd"]); // plain links: they work with no script, and the list is in the page's own order
    expect(links.every((l) => l.lang === l.hreflang)).toBe(true);
    expect(links.filter((l) => l.current).map((l) => l.lang)).toEqual(["cc"]);
    expect(links.map((l) => l.name)).toEqual(["Aaland", "Бебе", "Çeçe", "Dëdé"]); // native names
  });

  it("3 languages already make a dropdown; an unknown code falls back to the code itself", () => {
    expect(html(<LanguageSwitcher languages={codes(3)} current="aa" label="L" registry={fake(3)} />)).toContain("<details");
    expect(html(<LanguageSwitcher languages={["aa", "zz", "bb"]} current="aa" label="L" registry={fake(2)} />)).toContain(">zz</a>");
  });

  it("the header's real two-language page keeps the two text links", () => {
    for (const lang of ["de", "en"] as const) expect(html(<Header site={two(lang)} />)).not.toContain("lang-menu");
  });
});

describe("the dropdown, in a browser-like DOM", () => {
  let root: Root;
  let box: HTMLDivElement;
  const mountMenu = (current = "bb") => {
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root.render(<LanguageSwitcher languages={codes(4)} current={current} label="Sprache" registry={fake(4)} />));
    return { menu: box.querySelector("details") as HTMLDetailsElement, summary: box.querySelector("summary") as HTMLElement };
  };
  afterEach(() => {
    act(() => root.unmount());
    box.remove();
    window.location.hash = "";
  });

  it("starts closed, opens from its summary, and every link keeps the page's #fragment", () => {
    window.location.hash = "#gallery-2";
    const { menu } = mountMenu();
    expect(menu.open).toBe(false);
    act(() => void (menu.open = true));
    expect([...menu.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/aa#gallery-2", "/bb#gallery-2", "/cc#gallery-2", "/dd#gallery-2"]);
  });

  it("is a named control for a screen reader: the nav has the label, the summary says label and current language, the list is a list of links", () => {
    const { summary } = mountMenu("dd");
    expect(box.querySelector("nav")!.getAttribute("aria-label")).toBe("Sprache");
    expect(summary.getAttribute("aria-label")).toBe("Sprache: Dëdé");
    expect(summary.textContent).toContain("Dëdé"); // the visible text is part of the accessible name
    expect(box.querySelectorAll("ul > li > a")).toHaveLength(4);
    expect(box.querySelectorAll("a[aria-current='true']")).toHaveLength(1);
  });

  it("Escape closes it and puts the focus back on the summary", () => {
    const { menu, summary } = mountMenu();
    act(() => void (menu.open = true));
    const link = menu.querySelector("a") as HTMLElement;
    link.focus();
    act(() => void link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("closes on a press outside it, and on Tab out of its list; stays open on a press inside", () => {
    const { menu } = mountMenu();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    act(() => void (menu.open = true));
    act(() => void menu.querySelector("a")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(menu.open).toBe(true);
    act(() => void menu.querySelector("a")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: menu.querySelectorAll("a")[1] })));
    expect(menu.open).toBe(true); // focus moved to another link of the list
    act(() => void menu.querySelector("a")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside })));
    expect(menu.open).toBe(false);
    act(() => void (menu.open = true));
    act(() => void outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(menu.open).toBe(false);
    outside.remove();
  });
});

describe("the header controls' styles: theme variables, control-sized targets", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (selector: string) => new RegExp(`${selector.replace(/[.[\]"=()>]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("the dropdown, the links and the header button are exactly --header-control-h high (one variable for the row) and use no literal colour or font", () => {
    for (const sel of [".lang-switch a", ".lang-menu__current", ".site-header__end > .button--small"]) {
      expect(block(sel), sel).toMatch(/height: var\(--header-control-h, 2\.25rem\)/);
    }
    for (const sel of [".lang-menu", ".lang-menu__current", ".lang-menu__list", ".lang-menu__list a", '.lang-menu__list a[aria-current="true"]']) {
      const body = block(sel);
      expect(body, sel).not.toBe("");
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-family|(?<![-\w])transform\s*:/i);
    }
    expect(block(".lang-menu__list")).toMatch(/z-index: 30/); // above the hero below it
    expect(block(".lang-menu__list")).toMatch(/background: var\(--bg\)/);
  });
});
