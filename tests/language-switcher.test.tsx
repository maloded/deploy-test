// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "@/components/Header";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
