/* eslint-disable @typescript-eslint/no-explicit-any -- tests build partial sites */
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Footer, musicCredits } from "@/components/Footer";
import { buildSite } from "@/lib/site";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: { en: id, de: id }, file: `audio/${id}.wav`, license: "licence note, never shown", ...extra });
function site(tracks: unknown[] | undefined, lang: "en" | "de" = "en") {
  const base = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  return { ...base, product: { ...base.product, music: tracks ? { tracks, volume: 0.15 } : undefined } } as any;
}

describe("the music credit in the footer", () => {
  it("is not there without music, or when no track asks for a credit (the licence text is never shown)", () => {
    for (const s of [site(undefined), site([t("a"), t("b")])]) {
      const out = renderToStaticMarkup(<Footer site={s} />);
      expect(out).not.toContain("site-footer__credit");
      expect(out).not.toContain("licence note");
    }
  });

  it("shows one line with the credit, in the page language label", () => {
    const en = renderToStaticMarkup(<Footer site={site([t("a", { credit: "Calm by A. Artist, CC BY 4.0" })])} />);
    expect(en).toContain('<p class="site-footer__credit">Music: <span>Calm by A. Artist, CC BY 4.0</span></p>');
    const de = renderToStaticMarkup(<Footer site={site([t("a", { credit: "Ruhe von A. Artist" })], "de")} />);
    expect(de).toContain("Musik:");
  });

  it("links the credit with rel noopener noreferrer in a new tab when it has an https address", () => {
    const out = renderToStaticMarkup(<Footer site={site([t("a", { credit: "Calm", creditUrl: "https://example.org/calm" })])} />);
    expect(out).toContain('<a href="https://example.org/calm" target="_blank" rel="noopener noreferrer">Calm</a>');
  });

  it("lists several credits once each, in track order, separated by a dot", () => {
    const s = site([t("a", { credit: "One" }), t("b"), t("c", { credit: "Two", creditUrl: "https://example.org/2" }), t("d", { credit: "One" })]);
    expect(musicCredits(s)).toEqual([{ credit: "One", url: undefined }, { credit: "Two", url: "https://example.org/2" }]);
    const out = renderToStaticMarkup(<Footer site={s} />);
    expect(out).toMatch(/Music: <span>One<\/span><span> · <a [^>]*>Two<\/a><\/span>/);
  });

  it("sits in row 2 beside the version line (the right column under the legal links), not under the note, and both are in one quiet row", () => {
    const out = renderToStaticMarkup(<Footer site={site([t("a", { credit: "Pixabay", creditUrl: "https://pixabay.com/" })])} />);
    const bottom = out.slice(out.indexOf('class="site-footer__bottom"'));
    const notes = /<div class="site-footer__notes">(.*?)<\/div>/.exec(bottom)?.[1] ?? "";
    expect(notes).not.toContain("site-footer__credit"); // no longer under the legal note
    const end = bottom.slice(bottom.indexOf('class="site-footer__end"'));
    expect(end).toMatch(/<div class="site-footer__meta"><p class="site-footer__credit">Music: <span><a href="https:\/\/pixabay\.com\/"[^>]*>Pixabay<\/a><\/span><\/p>/);
    expect(end.indexOf("site-footer__credit")).toBeGreaterThan(end.indexOf("site-footer__legal-links") === -1 ? -1 : 0);
  });

  it("is in the same quiet type as the version line (size and colour), with a dot between them", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    const rule = (sel: string) => [...css.matchAll(new RegExp(`\\n${sel.replace(/[.+]/g, "\\$&")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");
    const pick = (text: string, prop: string) => new RegExp(`${prop}:\\s*([^;]+);`).exec(text)?.[1].trim();
    for (const prop of ["font-size", "color"]) expect(pick(rule(".site-footer__credit"), prop), prop).toBe(pick(rule(".site-footer__version"), prop));
    expect(css).toMatch(/\.site-footer__credit \+ \.site-footer__version::before/); // the dot between them
  });

  it("escapes what the content says", () => {
    const out = renderToStaticMarkup(<Footer site={site([t("a", { credit: '<img src=x onerror="1">' })])} />);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("has its label in both languages", () => {
    expect(UI_KEYS).toContain("footer.music");
    expect(ui("footer.music", "en")).toBe("Music:");
    expect(ui("footer.music", "de")).toBe("Musik:");
  });
});
