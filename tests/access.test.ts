import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import { proxy } from "@/proxy";
import { basicAuthOk, prototypeNoteEnabled, reviewPassword, reviewSwitcherEnabled } from "@/lib/review";

const basic = (user: string, pass: string) => "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const get = (url: string, authorization?: string) =>
  proxy(new NextRequest(`http://localhost:3000${url}`, { headers: authorization ? { authorization } : {} }));

afterEach(() => vi.unstubAllEnvs());

describe("review password", () => {
  it("requires Basic auth when REVIEW_PASSWORD is set: 401 with WWW-Authenticate", () => {
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    for (const url of ["/", "/media/vw-multivan/Front-side.jpg", "/_next/image?url=%2Fmedia%2Fx.jpg&w=640&q=75", "/themes/light-editorial.css", "/api/leads", "/_next/static/chunks/a.js"]) {
      const res = get(url);
      expect(res.status, url).toBe(401);
      expect(res.headers.get("www-authenticate"), url).toMatch(/^Basic realm="Review"/);
      expect(res.headers.get("x-robots-tag"), url).toContain("noindex");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("accepts the right password with any user name", () => {
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    for (const user of ["anyone", "", "reviewer", "Ünïcode"]) {
      const res = get("/", basic(user, "s3cret"));
      expect(res.status, user).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1"); // let through
    }
  });

  it("accepts a password that contains a colon", () => {
    vi.stubEnv("REVIEW_PASSWORD", "pa:ss:word");
    expect(get("/", basic("u", "pa:ss:word")).status).toBe(200);
    expect(get("/", basic("u", "pa")).status).toBe(401);
  });

  it("rejects a wrong password, a prefix, a longer one, an empty one and malformed headers", () => {
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    for (const header of [basic("u", "wrong"), basic("u", "s3cre"), basic("u", "s3cretX"), basic("u", ""), basic("u", "S3CRET"), "Basic", "Basic !!!", "Bearer s3cret", "s3cret", "Basic " + Buffer.from("nocolon").toString("base64")]) {
      expect(get("/", header).status, header).toBe(401);
    }
  });

  it("is not applied when REVIEW_PASSWORD is missing or empty", () => {
    vi.stubEnv("REVIEW_PASSWORD", "");
    expect(reviewPassword()).toBeUndefined();
    expect(get("/").status).toBe(200);
    vi.stubEnv("REVIEW_PASSWORD", undefined as unknown as string);
    delete process.env.REVIEW_PASSWORD;
    expect(get("/").status).toBe(200);
    expect(get("/api/anything").status).toBe(200);
  });

  it("protects /robots.txt not at all, so crawlers read disallow-all instead of an error", () => {
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    expect(get("/robots.txt").status).toBe(200);
  });

  it("compares by hashing, so the length does not matter, and never logs anything", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    get("/", basic("u", "x".repeat(10_000)));
    get("/", basic("u", "s3cret"));
    get("/");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
    expect(basicAuthOk(basic("u", "s3cret"), "s3cret")).toBe(true);
    expect(basicAuthOk(null, "s3cret")).toBe(false);
    expect(basicAuthOk(undefined, "s3cret")).toBe(false);
  });

  it("uses timingSafeEqual (not === on the secret) in the source", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "review.ts"), "utf8");
    expect(src).toContain("timingSafeEqual");
    expect(src).not.toMatch(/===\s*password|password\s*===/);
    const proxySrc = fs.readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(proxySrc).not.toMatch(/console\./);
  });
});

describe("noindex everywhere", () => {
  it("sets X-Robots-Tag on every response from the proxy, protected or not", () => {
    for (const url of ["/", "/robots.txt", "/media/a.jpg", "/api/x"]) expect(get(url).headers.get("x-robots-tag"), url).toMatch(/noindex/);
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    for (const url of ["/", "/media/a.jpg"]) {
      expect(get(url).headers.get("x-robots-tag")).toMatch(/noindex/);
      expect(get(url, basic("u", "s3cret")).headers.get("x-robots-tag")).toMatch(/noindex/);
    }
  });

  it("also sets it for every route through next.config (files the proxy does not handle)", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    expect(all.headers).toEqual([expect.objectContaining({ key: "X-Robots-Tag", value: expect.stringContaining("noindex") })]);
  });

  it("serves a robots.txt that disallows everything", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("has a noindex meta tag in the page metadata", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
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

describe("images behind the password", () => {
  const load = async () => {
    vi.resetModules();
    return (await import("../next.config")).default;
  };

  it("are served directly (not through the optimizer) when REVIEW_PASSWORD is set: the optimizer's internal fetch has no credentials", async () => {
    vi.stubEnv("REVIEW_PASSWORD", "s3cret");
    expect((await load()).images?.unoptimized).toBe(true);
  });

  it("keep the optimizer when there is no password", async () => {
    vi.stubEnv("REVIEW_PASSWORD", "");
    expect((await load()).images?.unoptimized).toBe(false);
    expect((await load()).images?.qualities).toEqual([75, 85]);
  });
});
