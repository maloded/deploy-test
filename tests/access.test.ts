import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { proxy } from "@/proxy";
import { prototypeNoteEnabled, reviewSwitcherEnabled } from "@/lib/review";

const get = (url: string) => proxy(new NextRequest(`http://localhost:3000${url}`));

afterEach(() => vi.unstubAllEnvs());

describe("the proxy", () => {
  it("lets every request through, logs nothing and has no authentication of its own", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    for (const url of ["/", "/media/a.jpg", "/api/anything", "/_next/image?url=%2Fmedia%2Fx.jpg&w=640&q=75", "/robots.txt"]) {
      const res = get(url);
      expect(res.status, url).not.toBe(401);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
    const proxySrc = fs.readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(proxySrc).not.toMatch(/console\./);
  });
});

describe("noindex everywhere", () => {
  it("sets X-Robots-Tag on every response from the proxy", () => {
    for (const url of ["/", "/robots.txt", "/media/a.jpg", "/api/x"]) expect(get(url).headers.get("x-robots-tag"), url).toMatch(/noindex/);
  });

  it("also sets it for every route through next.config (files the proxy does not handle)", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    expect(all.headers).toEqual([expect.objectContaining({ key: "X-Robots-Tag", value: expect.stringContaining("noindex") })]);
  });

  it("runs for every request: the proxy has no matcher", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(src).not.toMatch(/export const config/);
  });
});

describe("review switches", () => {
  it("read their environment variables", () => {
    expect(reviewSwitcherEnabled({ REVIEW_THEME_SWITCHER: "1" })).toBe(true);
    expect(reviewSwitcherEnabled({ REVIEW_THEME_SWITCHER: "0" })).toBe(false);
    expect(reviewSwitcherEnabled({})).toBe(false);
    expect(prototypeNoteEnabled({ NEXT_PUBLIC_PROTOTYPE_NOTE: "1" })).toBe(true);
    expect(prototypeNoteEnabled({ NEXT_PUBLIC_PROTOTYPE_NOTE: "" })).toBe(false);
    expect(prototypeNoteEnabled({})).toBe(false);
  });

  it("forwards ?theme= only where the switcher exists (not in production without the switch)", () => {
    // NODE_ENV is "test" here, which counts as not production
    expect(get("/?theme=dark-premium").headers.get("x-middleware-request-x-theme-override")).toBe("dark-premium");
    vi.stubEnv("NODE_ENV", "production");
    expect(get("/?theme=dark-premium").headers.get("x-middleware-request-x-theme-override")).toBeNull();
    vi.stubEnv("REVIEW_THEME_SWITCHER", "1");
    expect(get("/?theme=dark-premium").headers.get("x-middleware-request-x-theme-override")).toBe("dark-premium");
  });
});

describe("images", () => {
  it("always go through the optimizer, with the two qualities the page uses", async () => {
    vi.resetModules();
    const config = (await import("../next.config")).default;
    expect(config.images?.unoptimized).toBeUndefined();
    expect(config.images?.qualities).toEqual([75, 85]);
  });
});
