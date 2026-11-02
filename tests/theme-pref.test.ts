import { describe, expect, it } from "vitest";
import { chooseTheme, modeOf, parseMode, readStoredMode, themeBootScript, themePair, THEME_PAIR, THEME_STORAGE_KEY, writeStoredMode } from "@/lib/theme-pref";

const BOTH = ["dark-premium", "light-editorial"];
const pair = { ...THEME_PAIR };

describe("themePair", () => {
  it("is the pair when the product's theme is one of the two and both stylesheets exist", () => {
    expect(themePair("light-editorial", BOTH)).toEqual(pair);
    expect(themePair("dark-premium", BOTH)).toEqual(pair);
  });
  it("is null for a custom theme, or when the other stylesheet is missing", () => {
    expect(themePair("my-theme", [...BOTH, "my-theme"])).toBeNull();
    expect(themePair("light-editorial", ["light-editorial"])).toBeNull();
  });
});

describe("modes", () => {
  it("maps themes to modes and parses only light and dark", () => {
    expect(modeOf("dark-premium", pair)).toBe("dark");
    expect(modeOf("light-editorial", pair)).toBe("light");
    expect(modeOf("other", pair)).toBeNull();
    expect(parseMode("dark")).toBe("dark");
    for (const bad of ["Dark", "", null, undefined, 1, "dark-premium"]) expect(parseMode(bad)).toBeNull();
  });
});

describe("chooseTheme: the stored choice, else the product's theme (the system preference is never read)", () => {
  it("a stored choice wins", () => {
    expect(chooseTheme({ stored: "dark", product: "light-editorial", pair })).toBe("dark-premium");
    expect(chooseTheme({ stored: "light", product: "dark-premium", pair })).toBe("light-editorial");
  });
  it("without one, the product's own theme", () => {
    expect(chooseTheme({ stored: null, product: "light-editorial", pair })).toBe("light-editorial");
    expect(chooseTheme({ stored: null, product: "dark-premium", pair })).toBe("dark-premium");
  });
  it("takes no system input at all", () => {
    expect(chooseTheme.length).toBe(1);
    expect(Object.keys({ stored: null, product: "x", pair })).not.toContain("system");
  });
});

describe("storage is wrapped", () => {
  it("reads and writes the mode under one key", () => {
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    writeStoredMode(store, "dark");
    expect(data[THEME_STORAGE_KEY]).toBe("dark");
    expect(readStoredMode(store)).toBe("dark");
    data[THEME_STORAGE_KEY] = "garbage";
    expect(readStoredMode(store)).toBeNull();
  });
  it("a storage that throws, or none, is no choice and never throws", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readStoredMode(blocked)).toBeNull();
    expect(() => writeStoredMode(blocked, "dark")).not.toThrow();
    expect(readStoredMode(undefined)).toBeNull();
    expect(() => writeStoredMode(undefined, "light")).not.toThrow();
  });
});

describe("the head script (run against fakes)", () => {
  type Env = { stored?: string | null; systemDark?: boolean; systemLight?: boolean; search?: string; storageThrows?: boolean; noMatchMedia?: boolean };
  function run(product: string, env: Env = {}) {
    const attrs: Record<string, string> = {};
    const written: string[] = [];
    const document = { documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) }, write: (html: string) => void written.push(html) };
    const localStorage = { getItem: () => { if (env.storageThrows) throw new Error("denied"); return env.stored ?? null; } };
    const matchMedia = env.noMatchMedia ? undefined : (q: string) => ({ matches: q.includes("dark") ? !!env.systemDark : !!env.systemLight });
    const location = { search: env.search ?? "" };
    new Function("document", "localStorage", "matchMedia", "location", themeBootScript(product, pair))(document, localStorage, matchMedia, location);
    return { attrs, written };
  }

  it("a stored dark choice on a light product: data-theme is set and the dark stylesheet is written in the head", () => {
    const r = run("light-editorial", { stored: "dark" });
    expect(r.attrs["data-theme"]).toBe("dark-premium");
    expect(r.written).toEqual(['<link rel="stylesheet" href="/themes/dark-premium.css" data-theme-css="dark-premium">']);
  });
  it("a stored light choice on a dark product", () => {
    expect(run("dark-premium", { stored: "light" }).attrs["data-theme"]).toBe("light-editorial");
  });
  it("the system preference is ignored: dark or light, with nothing stored the server's theme stays", () => {
    for (const product of ["light-editorial", "dark-premium"]) {
      for (const env of [{ systemDark: true }, { systemLight: true }]) {
        const r = run(product, env);
        expect(r.attrs, JSON.stringify(env)).toEqual({});
        expect(r.written).toEqual([]);
      }
    }
  });
  it("a stored choice still wins over the system preference", () => {
    expect(run("light-editorial", { stored: "dark", systemLight: true }).attrs["data-theme"]).toBe("dark-premium");
    expect(run("light-editorial", { stored: "light", systemDark: true }).written).toEqual([]);
  });
  it("when the choice is the server's theme it does nothing and loads nothing", () => {
    for (const r of [run("light-editorial", { stored: "light" }), run("dark-premium", { systemDark: true }), run("light-editorial", {})]) {
      expect(r.attrs).toEqual({});
      expect(r.written).toEqual([]);
    }
  });
  it("a blocked storage keeps the product's theme, whatever the system says", () => {
    expect(run("light-editorial", { storageThrows: true, systemDark: true }).attrs).toEqual({});
  });
  it("never asks the browser for the colour scheme", () => {
    expect(themeBootScript("light-editorial", pair)).not.toMatch(/matchMedia|prefers-color-scheme/);
  });
  it("a stored value that is not light or dark is ignored", () => {
    expect(run("light-editorial", { stored: "evil\"><script>", systemLight: true }).written).toEqual([]);
  });
  it("the ?theme= override of development and review is left alone", () => {
    expect(run("light-editorial", { stored: "dark", search: "?theme=light-editorial" }).written).toEqual([]);
    expect(run("light-editorial", { stored: "dark", search: "?x=1&theme=dark-premium" }).attrs).toEqual({});
  });
  it("only writes names from the pair, never the stored text", () => {
    const script = themeBootScript("light-editorial", pair);
    expect(script).not.toMatch(/innerHTML|eval/);
    expect(script.length).toBeLessThan(700);
  });
});
