/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { loadProduct } from "@/lib/content";
import { buildSite } from "@/lib/site";
import { MAX_LOGO_BYTES, logoMarkup, logoProblem } from "@/lib/seller-logo";
import { sellerSchema } from "@/lib/seller";
import { fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const tmp = path.join(process.cwd(), ".test-tmp", "seller-logo");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const MARK = '<?xml version="1.0"?><!-- a mark --><svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -138 200 238"><path fill="currentColor" fill-rule="evenodd" d="M-100 0a100 100 0 1 0 200 0z"/><circle cx="68.4" cy="-118.9" r="18.9" fill="#5fd3f7"/></svg>';

let n = 0;
/** A copy of the fixture seller whose seller.json names `logo` and which holds the given files next to it. */
function setup(logo: string | undefined, files: Record<string, string> = {}) {
  const root = path.join(tmp, `case-${++n}`);
  fs.cpSync(path.join(fixtures.root, fixtures.seller), path.join(root, fixtures.seller), { recursive: true });
  const sellerFile = path.join(root, fixtures.seller, "seller.json");
  const seller = JSON.parse(fs.readFileSync(sellerFile, "utf8"));
  if (logo !== undefined) seller.logo = logo;
  fs.writeFileSync(sellerFile, JSON.stringify(seller, null, 2));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, fixtures.seller, name), text);
  return { root, load: (strictMedia = true) => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: root, strictMedia }) };
}

describe("logoProblem (an allowlist, not a cleaner)", () => {
  it("accepts plain shapes, with or without prolog and comments, gradients, masks and url(#id)", () => {
    expect(logoProblem(MARK)).toBeNull();
    expect(logoProblem('<svg viewBox="0 0 1 1"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#g)" d="M0 0"/></svg>')).toBeNull();
    expect(logoProblem("<svg viewBox='0 0 1 1'>\n  <g><rect x='0' y='0' width='1' height='1'/></g>\n</svg>\n")).toBeNull();
  });
  it.each([
    ["a script element", "<svg><script>alert(1)</script></svg>"],
    ["an event handler", '<svg><path onload="x()" d="M0 0"/></svg>'],
    ["an unquoted event handler", "<svg><path d=\"M0 0\" onload=x /></svg>"],
    ["a handler glued to the tag name", "<svg/onload=alert(1)></svg>"],
    ["a valueless attribute", "<svg><path d=\"M0 0\" autofocus /></svg>"],
    ["an a element with javascript:", '<svg><a href="javascript:x()"><path d="M0 0"/></a></svg>'],
    ["an entity-encoded javascript: link", '<svg><a href="jav&#x61;script:x()"><path d="M0 0"/></a></svg>'],
    ["any href", '<svg><use href="#a"/></svg>'],
    ["foreignObject", "<svg><foreignObject><div/></foreignObject></svg>"],
    ["a style element (it would restyle the page)", "<svg><style>body{display:none}</style></svg>"],
    ["a style attribute", '<svg><path style="display:none" d="M0 0"/></svg>'],
    ["an embedded image", '<svg><image href="data:image/png;base64,AA"/></svg>'],
    ["an animation element", '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>'],
    ["a url() to another file", '<svg><path fill="url(https://example.com/a)" d="M0 0"/></svg>'],
    ["an entity in a value", '<svg><path fill="url(&#35;g)" d="M0 0"/></svg>'],
    ["a data: value", '<svg><path fill="data:x" d="M0 0"/></svg>'],
    ["a comment that a browser ends early (<!-->)", "<!--><script>alert(1)</script>--><svg></svg>"],
    ["a comment inside the svg", "<svg><!-- x --><path d=\"M0 0\"/></svg>"],
    ["a CDATA section", "<svg><![CDATA[<script>x</script>]]></svg>"],
    ["a doctype", '<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'],
    ["text inside the svg", "<svg>hello</svg>"],
    ["text after the svg", "<svg></svg><p>x</p>"],
    ["two svg roots", "<svg></svg><svg></svg>"],
    ["an unclosed svg", "<svg><g></svg>"],
    ["a mismatched closing tag", "<svg><g></path></svg>"],
    ["a name that hides a tag (<scr<script>ipt>)", "<svg><scr<script>ipt>x</scr</script>ipt></svg>"],
    ["a no-break space where an HTML parser sees no white space", '<svg><path\u00a0d="M0 0"/></svg>'],
    ["a line separator inside a tag", '<svg><path d="M0 0"\u2028onload="x"/></svg>'],
    ["a byte order mark", '\ufeff<svg></svg>'],
    ["a non-ASCII letter", '<svg><path id="\u00e4" d="M0 0"/></svg>'],
    ["a control character", '<svg><path d="M0\u0000 0"/></svg>'],
    ["a repeated attribute", '<svg><path d="M0 0" d="M1 1"/></svg>'],
    ["something that is not an SVG", "<div>logo</div>"],
    ["nothing", ""],
  ])("refuses %s", (_what, svg) => {
    expect(logoProblem(svg)).toEqual(expect.any(String));
  });
  it("refuses a file over the size limit", () => {
    expect(logoProblem("<svg></svg>", MAX_LOGO_BYTES + 1)).toMatch(/at most 32 KB/);
  });
});

describe("logoMarkup is built from the parsed file, not copied", () => {
  it("emits canonical names and escaped quoted values, and drops everything the file had around the shapes", () => {
    const m = logoMarkup("<SVG VIEWBOX='0 0 1 1' xmlns=\"http://www.w3.org/2000/svg\">\n <PATH D='M0 0 \"x'   FILL=\"red\" />\n</SVG>");
    expect(m).toBe('<svg aria-hidden="true" focusable="false" viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 &quot;x" fill="red"/></svg>');
  });
  it("throws for a file the check refuses, so unchecked text never reaches the page", () => {
    expect(() => logoMarkup("<svg><script>x</script></svg>")).toThrow(/The logo uses <script>/);
  });
});

describe("logoMarkup", () => {
  it("drops the prolog and comments and hides the SVG from assistive technology", () => {
    const m = logoMarkup(MARK);
    expect(m.startsWith('<svg aria-hidden="true" focusable="false" xmlns=')).toBe(true);
    expect(m.match(/aria-hidden/g)).toHaveLength(1); // on the root only
    expect(m).not.toMatch(/<\?xml|<!--/);
    expect(m).toContain('fill="currentColor"');
  });
});

describe("seller.json logo", () => {
  const seller = () => JSON.parse(fs.readFileSync(path.join(fixtures.root, fixtures.seller, "seller.json"), "utf8"));
  it("is optional, and a plain .svg file name", () => {
    expect(sellerSchema.safeParse(seller()).success).toBe(true);
    expect(sellerSchema.safeParse({ ...seller(), logo: "logo.svg" }).success).toBe(true);
    for (const bad of ["logo.png", "../logo.svg", "a/b.svg", "", 3]) expect(sellerSchema.safeParse({ ...seller(), logo: bad }).success, String(bad)).toBe(false);
  });
  it("is loaded as checked markup next to the seller", () => {
    expect(setup("logo.svg", { "logo.svg": MARK }).load().logo).toBe(logoMarkup(MARK));
  });
  it("is null without the field, and the fixture seller has none", () => {
    expect(setup(undefined).load().logo).toBeNull();
    expect(fixtures.loadFor("fixture-car").logo).toBeNull();
  });
  it("a missing file stops the load, or is a warning when media is not strict", () => {
    const c = setup("logo.svg");
    expect(() => c.load()).toThrow(/logo: file "logo.svg" not found in /);
    const loose = c.load(false);
    expect(loose.logo).toBeNull();
    expect(loose.warnings.join("\n")).toMatch(/logo: file "logo.svg" not found/);
  });
  it("a file that is not plain shapes always stops the load", () => {
    const c = setup("logo.svg", { "logo.svg": "<svg><script>x</script></svg>" });
    expect(() => c.load(false)).toThrow(/logo: "logo.svg" uses <script>/);
  });
});

describe("the snapshot", () => {
  it("lets a small logo next to seller.json travel and refuses a large one", async () => {
    const { forbiddenReason } = await import("../scripts/lib/snapshot-guard.mjs");
    expect(forbiddenReason("content/example-seller/logo.svg", 2000)).toBeNull();
    expect(forbiddenReason("content/example-seller/logo.svg", MAX_LOGO_BYTES + 1)).toMatch(/logo/);
  });
});

describe("in the header", () => {
  const site = (logo: string | null) => ({ ...buildSite(null, `${fixtures.seller}/fixture-car`, fixtures.root, "en"), logo }) as any;
  it("shows the logo before the name, hidden from assistive technology, and the name stays visible text", () => {
    const out = renderToStaticMarkup(<Header site={site(logoMarkup(MARK))} />);
    expect(out).toMatch(/<span class="site-header__logo" aria-hidden="true"><svg aria-hidden="true"[^>]*>.*<\/svg><\/span><span class="site-header__name">/);
    expect(out).toContain('fill="currentColor"');
  });
  it("without a logo it is the name alone, as before", () => {
    const out = renderToStaticMarkup(<Header site={site(null)} />);
    expect(out).not.toContain("site-header__logo");
    expect(out).toContain('class="site-header__name"');
  });
  it("the stylesheet sizes the mark from the brand size and colours it with the text colour (both themes)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.site-header__logo \{[^}]*color: var\(--text\)/);
    expect(css).toMatch(/\.site-header__logo svg \{[^}]*height: calc\(var\(--brand-size, 1\.7rem\) \* 1\.15\)/);
  });
});
