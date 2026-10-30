import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/[lang]/layout";
import { ICON_FILES, MAX_ICON_BYTES, iconProblem, sellerIconFile, sellerIconHref } from "@/lib/seller-icon";
import { makeWebImages } from "../scripts/lib/web-images.mjs";
import { forbiddenReason } from "../scripts/lib/snapshot-guard.mjs";
import { FIXTURE_DIR, fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "seller-icon");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456"/></svg>';
let PNG: Buffer;

/** A content root with the fixture seller and product; `icon` is written next to seller.json when given. */
function content(name: string, icon?: { file: string; data: Buffer | string }) {
  const root = path.join(tmp, name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(path.join(FIXTURE_DIR, fixtures.seller), path.join(root, fixtures.seller), { recursive: true });
  if (icon) fs.writeFileSync(path.join(root, fixtures.seller, icon.file), icon.data);
  return root;
}

beforeAll(async () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  PNG = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#336699" } }).png().toBuffer();
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

describe("finding the icon", () => {
  it("is icon.svg, else icon.png, next to seller.json; none otherwise", () => {
    expect(ICON_FILES).toEqual(["icon.svg", "icon.png"]);
    expect(sellerIconFile(path.join(content("none"), fixtures.seller))).toBeNull();
    expect(sellerIconFile(path.join(content("png", { file: "icon.png", data: PNG }), fixtures.seller))).toBe("icon.png");
    const both = content("both", { file: "icon.svg", data: SVG });
    fs.writeFileSync(path.join(both, fixtures.seller, "icon.png"), PNG);
    expect(sellerIconFile(path.join(both, fixtures.seller))).toBe("icon.svg");
  });

  it("gives the public path and type of the served seller's icon, and null without one", () => {
    const env = (root: string) => ({ CONTENT_DIR: root, CONTENT_PRODUCT: fixtures.ref("fixture-car") });
    expect(sellerIconHref(env(content("h-none")))).toBeNull();
    expect(sellerIconHref(env(content("h-png", { file: "icon.png", data: PNG })))).toEqual({ href: `/media/${fixtures.seller}/icon.png`, type: "image/png" });
    expect(sellerIconHref(env(content("h-svg", { file: "icon.svg", data: SVG })))).toEqual({ href: `/media/${fixtures.seller}/icon.svg`, type: "image/svg+xml" });
    expect(sellerIconHref({ CONTENT_DIR: path.join(tmp, "missing") })).toBeNull(); // an unreadable root is not an error here
  });
});

describe("what is refused", () => {
  const file = (name: string, data: Buffer | string) => {
    const f = path.join(tmp, "refuse", name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
    return f;
  };

  it("an icon over the size limit, and an SVG with script or an event handler", () => {
    expect(iconProblem(file("ok.svg", SVG))).toBeNull();
    expect(iconProblem(file("big.png", Buffer.alloc(MAX_ICON_BYTES + 1)))).toMatch(/at most 256 KB/);
    expect(iconProblem(file("s.svg", SVG.replace("</svg>", "<script>alert(1)</script></svg>")))).toMatch(/script/);
    expect(iconProblem(file("e.svg", SVG.replace("<rect", '<rect onload="x()"')))).toMatch(/event handler/);
    expect(iconProblem(file("j.svg", SVG.replace("<rect", '<a href="javascript:x()"><rect')))).toMatch(/script|event/);
  });

  it("the snapshot guard: only icon.svg or icon.png, small", () => {
    expect(forbiddenReason("content/seller/icon.png", 1000)).toBeNull();
    expect(forbiddenReason("content/seller/icon.svg", 1000)).toBeNull();
    expect(forbiddenReason("content/seller/icon.png", MAX_ICON_BYTES + 1)).toMatch(/over the icon limit/);
    expect(forbiddenReason("content/seller/icon.gif", 10)).toMatch(/icon.svg or icon.png/);
    expect(forbiddenReason("content/seller/seller.json", 10)).toBeNull();
  });
});

describe("npm run images carries it", () => {
  it("copies it as it is to public/media/<seller>/, and leaves nothing when the seller has none", async () => {
    const withIcon = content("img-with", { file: "icon.png", data: PNG });
    const out = path.join(tmp, "out-with");
    const results = await makeWebImages({ contentDir: withIcon, outDir: out });
    expect(results.filter((r) => r.file === "icon.png")).toEqual([{ slug: fixtures.seller, file: "icon.png", action: "copied" }]);
    expect(fs.readFileSync(path.join(out, fixtures.seller, "icon.png")).equals(PNG)).toBe(true); // byte for byte
    const without = content("img-without");
    const out2 = path.join(tmp, "out-without");
    await makeWebImages({ contentDir: without, outDir: out2 });
    expect(fs.existsSync(path.join(out2, fixtures.seller, "icon.png"))).toBe(false);
    expect(fs.existsSync(path.join(out2, fixtures.seller, "icon.svg"))).toBe(false);
  });

  it("removes a stale icon from the output when the source is gone, and stops on a bad icon", async () => {
    const root = content("img-stale", { file: "icon.svg", data: SVG });
    const out = path.join(tmp, "out-stale");
    await makeWebImages({ contentDir: root, outDir: out });
    expect(fs.existsSync(path.join(out, fixtures.seller, "icon.svg"))).toBe(true);
    fs.rmSync(path.join(root, fixtures.seller, "icon.svg"));
    await makeWebImages({ contentDir: root, outDir: out });
    expect(fs.existsSync(path.join(out, fixtures.seller, "icon.svg"))).toBe(false);
    fs.writeFileSync(path.join(root, fixtures.seller, "icon.png"), Buffer.alloc(MAX_ICON_BYTES + 1));
    await expect(makeWebImages({ contentDir: root, outDir: out })).rejects.toThrow(/icon.png is \d+ KB; an icon may be at most 256 KB/);
  });
});

describe("the page links it only when there is one", () => {
  const meta = async (root: string) => {
    vi.stubEnv("CONTENT_DIR", root);
    vi.stubEnv("CONTENT_PRODUCT", fixtures.ref("fixture-car"));
    return generateMetadata({ params: Promise.resolve({ lang: "en" }) });
  };

  it("adds icons to the metadata with the seller's icon", async () => {
    expect((await meta(content("m-png", { file: "icon.png", data: PNG }))).icons).toEqual({ icon: [{ url: `/media/${fixtures.seller}/icon.png`, type: "image/png" }] });
  });

  it("adds nothing without one: no icons key at all", async () => {
    const m = await meta(content("m-none"));
    expect(m).not.toHaveProperty("icons");
    expect(m.title).toBeTruthy(); // the rest of the metadata is untouched
  });
});
