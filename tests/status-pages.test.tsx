// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { StatusProvider } from "@/components/StatusContext";
import { StatusPage } from "@/components/StatusPage";
import { LANGUAGES } from "@/lib/languages";
import { siteStatusEnv } from "@/lib/root-redirect";
import { STATUS_STRINGS, statusText, type StatusKey } from "@/lib/status-texts";
import { UI_KEYS, ui } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const src = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");
const SECRET = "SECRET-DETAIL-4711";
const KEYS = Object.keys(STATUS_STRINGS) as StatusKey[];

vi.mock("@/lib/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/site")>();
  return { ...actual, getSite: (lang: string | null) => actual.buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, (lang ?? undefined) as any) };
});

afterEach(() => vi.unstubAllEnvs());

describe("the texts", () => {
  it("are in the UI strings (ui() answers them) and complete in every language of the registry", () => {
    expect(KEYS).toEqual(["notfound.title", "notfound.text", "page.back", "error.title", "error.text", "error.retry"]);
    for (const key of KEYS) {
      expect(UI_KEYS, key).toContain(key);
      for (const lang of LANGUAGES) {
        expect(ui(key, lang), `${key} ${lang}`).toBeTruthy();
        expect(statusText(key, lang)).toBe(ui(key, lang));
      }
    }
    expect(ui("notfound.title", "de")).not.toBe(ui("notfound.title", "en"));
    expect(ui("error.text", "de")).not.toBe(ui("error.text", "en"));
  });

  it("say nothing technical", () => {
    for (const key of KEYS) for (const lang of LANGUAGES) expect(ui(key, lang), key).not.toMatch(/404|500|exception|stack|digest|undefined/i);
  });
});

describe("StatusPage", () => {
  const page = (extra: object = {}) =>
    renderToStaticMarkup(<StatusPage brand="Zorbo & Co" title="Seite nicht gefunden" text="Die gesuchte Seite gibt es nicht." homeHref="/de" homeLabel="Zurück zur Seite" {...extra} />);

  it("shows the brand, one h1, the sentence and the way back to the product page", () => {
    const out = page();
    expect(out).toContain("Zorbo &amp; Co");
    expect(out.match(/<h1\b/g)).toHaveLength(1);
    expect(out).toContain('<a class="button" href="/de">Zurück zur Seite</a>');
    expect(out).not.toContain("<nav"); // no language links without languages
  });

  it("links every language when there is more than one", () => {
    const out = page({ languages: [{ code: "de", name: "Deutsch", href: "/de" }, { code: "en", name: "English", href: "/en" }], languageLabel: "Sprache" });
    expect(out).toContain('<nav class="status-page__languages" aria-label="Sprache">');
    expect(out).toContain('href="/de" lang="de" hrefLang="de">Deutsch</a>');
    expect(out).toContain('href="/en" lang="en" hrefLang="en">English</a>');
    expect(page({ languages: [{ code: "de", name: "Deutsch", href: "/de" }] })).not.toContain("<nav");
  });

  it("carries the robots meta only when asked (the error boundaries cannot export metadata)", () => {
    expect(page({ noindex: true })).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(page()).not.toContain('name="robots"');
  });
});

describe("the error page of a language route (error.tsx)", () => {
  let root: Root | undefined;
  let box: HTMLDivElement | undefined;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    box?.remove();
    root = box = undefined;
  });
  const mount = async (withProvider: boolean, reset = vi.fn()) => {
    const { default: ErrorPage } = await import("@/app/[lang]/error");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    const error = Object.assign(new Error(SECRET), { digest: SECRET, stack: `Error: ${SECRET}\n  at secret.ts:1` });
    const el = <ErrorPage error={error} reset={reset} />;
    act(() => root!.render(withProvider ? <StatusProvider value={{ lang: "de", brand: "Zorbo", homeHref: "/de", title: ui("error.title", "de"), text: ui("error.text", "de"), retry: ui("error.retry", "de"), back: ui("page.back", "de") }}>{el}</StatusProvider> : el));
    return { reset };
  };

  it("shows the seller's texts, never the message, the stack or the digest, and says noindex", async () => {
    await mount(true);
    const html = box!.innerHTML;
    expect(html).toContain(ui("error.title", "de"));
    expect(html).toContain("Zorbo");
    expect(html).not.toContain(SECRET);
    expect(html).not.toMatch(/secret\.ts|digest/i);
    expect(document.head.innerHTML + html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });

  it("offers a retry that calls reset, and a link back to the product page", async () => {
    const { reset } = await mount(true);
    act(() => void (box!.querySelector("button") as HTMLButtonElement).click());
    expect(reset).toHaveBeenCalledTimes(1);
    expect(box!.querySelector("a.button")!.getAttribute("href")).toBe("/de");
  });

  it("falls back to the English texts when the layout's strings are missing", async () => {
    await mount(false);
    expect(box!.innerHTML).toContain("Something went wrong");
    expect(box!.innerHTML).not.toContain(SECRET);
  });
});

describe("the 404 page (global-not-found)", () => {
  it("speaks the seller's default language, names the seller, links the product page and every language", async () => {
    const { default: GlobalNotFound } = await import("@/app/global-not-found");
    const site = fixtures.siteFor("fixture-car");
    const out = renderToStaticMarkup(<GlobalNotFound />);
    expect(out).toContain(`<html lang="${site.lang}"`);
    expect(out).toContain(ui("notfound.title", site.lang));
    expect(out).toContain(ui("notfound.text", site.lang));
    expect(out).toContain(site.seller.displayName);
    expect(out).toContain(`href="/${site.lang}"`);
    for (const code of site.product.languages) expect(out).toContain(`href="/${code}"`);
    expect(out).toContain(`/themes/${site.theme}.css`);
  });

  it("is noindex in its metadata whatever SITE_INDEXABLE says, and its title names the seller", async () => {
    const { generateMetadata } = await import("@/app/global-not-found");
    for (const v of [undefined, "1"]) {
      vi.stubEnv("SITE_INDEXABLE", v as string);
      const meta = generateMetadata();
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(String(meta.title)).toContain(fixtures.siteFor("fixture-car").seller.displayName);
    }
  });

  it("is switched on in next.config (Next's experimental global-not-found: the root layout is in [lang])", () => {
    expect(nextConfig.experimental?.globalNotFound).toBe(true);
    expect(src("src", "app", "global-not-found.tsx")).toMatch(/globalNotFound/); // the comment says why
  });
});

describe("the error page of the root layout (global-error)", () => {
  it("brings its own document, is noindex, shows the seller's brand and no error", async () => {
    vi.stubEnv("SITE_BRAND", "Zorbo");
    vi.stubEnv("SITE_DEFAULT_LANGUAGE", "de");
    vi.resetModules();
    const { default: GlobalError } = await import("@/app/global-error");
    const out = renderToStaticMarkup(<GlobalError error={new Error(SECRET)} reset={() => {}} />);
    expect(out).toMatch(/^<html lang="de"/);
    expect(out).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(out).toContain("Zorbo");
    expect(out).toContain(ui("error.title", "de"));
    expect(out).not.toContain(SECRET);
  });

  it("gets its brand and theme from next.config's inlined env (siteStatusEnv), and an empty set when the content cannot be read", () => {
    const env = siteStatusEnv({ CONTENT_DIR: FIXTURE_DIR, CONTENT_PRODUCT: `${fixtures.seller}/fixture-car` });
    expect(env.SITE_BRAND).toBe(fixtures.siteFor("fixture-car").seller.displayName);
    expect(env.SITE_THEME).toMatch(/^[a-z0-9-]+$/);
    expect(siteStatusEnv({ CONTENT_DIR: path.join(FIXTURE_DIR, "nope") })).toEqual({});
  });
});

describe("what reaches the client", () => {
  const CLIENT = [["src", "app", "[lang]", "error.tsx"], ["src", "app", "global-error.tsx"], ["src", "components", "StatusContext.tsx"], ["src", "components", "StatusPage.tsx"]];

  it("no client file of the status pages imports the whole UI string bundle", () => {
    for (const f of CLIENT) expect(src(...f), f.join("/")).not.toMatch(/ui-strings/);
  });

  it("no status page prints an error message, a stack or a digest", () => {
    for (const f of CLIENT) {
      const code = src(...f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, f.join("/")).not.toMatch(/error\.(message|stack|digest|cause)|\.digest|console\./);
    }
  });

  it("the [lang] layout hands the boundary exactly the few strings, the brand and the way back", () => {
    const layout = src("src", "app", "[lang]", "layout.tsx");
    const value = /<StatusProvider value=\{\{(.*?)\}\}>/s.exec(layout)![1];
    const keys = [...value.matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(["back", "brand", "homeHref", "lang", "retry", "text", "title"]);
  });

  it("the error pages do not export metadata (client components cannot), so they carry the robots meta in the markup", () => {
    for (const f of [CLIENT[0], CLIENT[1]]) {
      const code = src(...f);
      expect(code).not.toMatch(/export (const metadata|function generateMetadata)/);
      expect(code).toContain("noindex");
    }
  });
});

describe("the limit of the 404 page: dynamicParams must stay false", () => {
  const MESSAGE =
    "src/app/[lang]/layout.tsx must keep `export const dynamicParams = false`. The branded 404 (global-not-found.tsx) only answers URLs that no route matches; with dynamicParams " +
    "true an unknown language would reach the layout's notFound(), and a notFound() thrown from the root layout is NOT caught by global-not-found: the visitor would get " +
    "Next's default English 404 body without the seller's name (verified with a production build). Change the flag only together with the 404 handling (see PROGRESS.md, layout polish / release mode).";

  it("the [lang] layout declares dynamicParams = false", () => {
    expect(src("src", "app", "[lang]", "layout.tsx"), MESSAGE).toMatch(/^export const dynamicParams = false;/m);
  });

  it("neither the layout nor the page opens it up in any other way", () => {
    for (const f of ["layout.tsx", "page.tsx"]) {
      const code = src("src", "app", "[lang]", f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, `${f}: ${MESSAGE}`).not.toMatch(/dynamicParams\s*=\s*(true\b|[^f\s])/);
    }
  });

  it("the notFound() safety net in the layout says why it is unreachable", () => {
    expect(src("src", "app", "[lang]", "layout.tsx")).toMatch(/unreachable while `dynamicParams = false`/);
  });
});
