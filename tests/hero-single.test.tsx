// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import { buildSite } from "@/lib/site";
import { validateProduct } from "@/lib/validate";
import { FIXTURE_DIR, fixtures } from "./helpers";

vi.mock("hanc-webrtc-widgets", () => ({}));

const AVATAR: ResolvedAvatar = { id: "p", name: "Test pack", poster: "/p.webp", invite: null, inviteCue: null, bubble: null, idle: null, listen: null, speak: null, caption: null, startLabel: null, endLabel: null, buttonIcon: "orb", role: null, languages: [], example: null, liveText: null, intro: null } as any;
const agent = { id: "test-agent-id", variant: "pill", placement: "header", voiceServiceUrl: "https://voice.hanc.ai" };

/** The fixture hero page with the card, a cut-out hero photo and the given hero settings. */
function heroOf({ hero, cutout = true, card = true }: { hero?: Record<string, unknown>; cutout?: boolean; card?: boolean }) {
  const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
  const product = { ...s.product, hero: { ...(s.product.hero ?? {}), ...(hero ?? {}) }, media: { ...s.product.media, heroCutout: cutout } };
  const site = { ...s, product, seller: { ...s.seller, agent: card ? agent : undefined } as any, avatar: card ? AVATAR : null } as any;
  const out = renderToStaticMarkup(<ProductLayout site={site} />);
  return /<section class="hero"[\s\S]*?<div class="hero__intro">/.exec(out)?.[0] ?? "";
}

describe("hero.mode / podium / lights in the schema", () => {
  const base = () => JSON.parse(JSON.stringify(fixtures.sampleJson("fixture-car")));
  const issues = (hero: unknown) => {
    const p = base();
    p.hero = { ...(p.hero ?? {}), ...(hero as object) };
    const r = validateProduct(p);
    return r.ok ? [] : r.issues;
  };

  it("accepts the settings: the podium as true or as its geometry, and the lights", () => {
    expect(issues({ mode: "single", podium: true, lights: [{ x: 62.5, y: 57.5, size: 21, aspect: 3.3, angle: 15 }, { x: 96, y: 44, size: 4 }] })).toEqual([]);
    expect(issues({ mode: "single", podium: { x: 44, y: 62, angle: 21.2, ratio: 0.475, scale: 1.22, thickness: 3.5 } })).toEqual([]);
    expect(issues({ mode: "single", podium: {} })).toEqual([]);
    expect(issues({ mode: "single", podium: { scale: 1.465, phoneScale: 1.43, phoneY: 69 } })).toEqual([]);
    expect(issues({ mode: "single", podium: { shadowY: 62, text: "Volkswagen", leds: true } })).toEqual([]);
    expect(issues({ mode: "single", podium: { text: { de: "Volkswagen", en: "Volkswagen" }, leds: { count: 8, colour: "#ffe7bd", breathe: true } } })).toEqual([]);
    expect(issues({ mode: "single", podium: { leds: false } })).toEqual([]);
    expect(issues({ mode: "single", podium: { leds: { twinkle: false, period: 9 } } })).toEqual([]);
    expect(issues({ mode: "single", podium: { leds: { period: 1 } } })).not.toEqual([]); // too fast to be calm
    expect(issues({ mode: "single", podium: { text: "VW", textOffset: 4, emblem: "podium-emblem.svg" } })).toEqual([]);
    expect(issues({ mode: "single", podium: true, frame: { left: -34, right: 122, top: -1.8, bottom: 130 } })).toEqual([]);
    expect(issues({ mode: "single", podium: true, frame: { left: -50, right: 150, top: -9, bottom: 123 }, phoneFrame: { left: -24, right: 136, top: -1.8, bottom: 130 } })).toEqual([]);
    expect(issues({ mode: "tiles" })).toEqual([]);
  });

  it("rejects what is out of range or unknown", () => {
    for (const bad of [{ mode: "grid" }, { podium: "yes" }, { floor: 95 }, { podium: { ratio: 0 } }, { podium: { ratio: 1.5 } }, { podium: { angle: 120 } }, { podium: { scale: 0 } }, { podium: { colour: "red" } }, { podium: { phoneScale: 0 } }, { podium: { phoneScale: 9 } }, { podium: { phoneY: 500 } }, { podium: { text: "" } }, { podium: { text: "x".repeat(25) } }, { podium: { leds: { count: 2 } } }, { podium: { leds: { count: 30 } } }, { podium: { leds: { colour: "red" } } }, { podium: { leds: { glow: 1 } } }, { podium: { textOffset: 50 } }, { podium: { emblem: "emblem.png" } }, { podium: { emblem: "../emblem.svg" } }, { frame: { left: 10, right: 5, top: 0, bottom: 100 } }, { frame: { left: 0, right: 100 } }, { frame: { left: 0, right: 100, top: 0, bottom: 100, x: 1 } }, { phoneFrame: { left: 10, right: 5, top: 0, bottom: 100 } }, { lights: [{ x: 120, y: 5, size: 3 }] }, { lights: [{ x: 5, y: 5, size: 0 }] }, { lights: [{ x: 5, y: 5, size: 3, color: "red" }] }, { lights: Array.from({ length: 7 }, () => ({ x: 1, y: 1, size: 1 })) }]) {
      expect(issues(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
});

describe("the single hero", () => {
  it("has no tiles, one large image in an inline SVG, and the headline and the card's slot as before", () => {
    const hero = heroOf({ hero: { mode: "single" } });
    expect(hero).toContain('data-mode="single"');
    expect(hero).not.toContain("hero__thumb");
    expect(hero).toMatch(/<svg class="hero__car"[^>]*role="img"/);
    expect(hero.match(/<image /g)).toHaveLength(1); // the van once: no podium, so no reflection
    expect(hero).toContain("data-agent-slot");
    expect(hero).not.toContain("hero__podium");
  });

  it("the podium is on only when asked for, and brings the platform, its contact shadow and a faint reflection", () => {
    const off = heroOf({ hero: { mode: "single" } });
    expect(off).not.toContain("hero__pod-top");
    const on = heroOf({ hero: { mode: "single", podium: true } });
    expect(on).toContain('data-podium="true"');
    for (const part of ["hero__pod-top", "hero__pod-side", "hero__pod-contact", "hero__pod-drop"]) expect(on, part).toContain(part);
    expect(on.match(/<image /g)).toHaveLength(1); // the van only: a mirror image would be wrong on a tilted ground plane
    expect(on).not.toContain("hero__pod-mirror");
  });

  it("the oval's geometry comes from the content: tilt, flatness, centre and size; the side is one extrusion of the top oval (tangent vertical lines at both ends)", () => {
    const top = (podium: unknown) => {
      const out = heroOf({ hero: { mode: "single", podium } });
      const d = /class="hero__pod-top" d="M([\d.-]+) ([\d.-]+)A([\d.]+) ([\d.]+) ([\d.-]+) 1 0 ([\d.-]+) ([\d.-]+)A/.exec(out)!;
      const [x1, y1, rx, ry, deg, x2, y2] = d.slice(1).map(Number);
      return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx, ry, deg, out };
    };
    const flat = top(true);
    expect(flat.deg).toBe(0);
    expect(flat.ry / flat.rx).toBeCloseTo(0.3, 2); // the default ratio
    const tilted = top({ angle: 38, ratio: 0.4, x: 40, y: 60, scale: 1.5 });
    expect(tilted.deg).toBe(38);
    expect(tilted.ry / tilted.rx).toBeCloseTo(0.4, 2);
    expect(tilted.rx / flat.rx).toBeCloseTo(1.5 / 1.2, 2); // the scale: the oval's width as a multiple of the photo's
    expect(tilted.cx / flat.cx).toBeCloseTo(40 / 50, 2); // the centre, in percent of the photo
    expect(tilted.cy / flat.cy).toBeCloseTo(60 / 100, 2);
    // the side wall is ONE closed shape: the top's front half to the far left, straight down by the thickness, the bottom's front half back, up
    for (const [podium, g] of [[true, flat], [{ angle: 38, ratio: 0.4, x: 40, y: 60, scale: 1.5 }, tilted]] as const) {
      expect(g.out.match(/class="hero__pod-side"/g)).toHaveLength(1);
      const w = /class="hero__pod-side" d="M([\d.-]+) ([\d.-]+)A([\d.]+) ([\d.]+) ([\d.-]+) 0 1 ([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)A[\d.]+ [\d.]+ [\d.-]+ 0 0 ([\d.-]+) ([\d.-]+)Z"/.exec(g.out);
      expect(w, String(podium)).not.toBeNull();
      const [rX, rY, , , , lX, lY, dX, dY, bX, bY] = w!.slice(1).map(Number);
      expect(dX).toBe(lX); // straight down at the left end
      expect(bX).toBe(rX); // and straight up at the right end
      expect(dY - lY).toBeCloseTo(bY - rY, 1); // the same thickness at both ends
      expect(dY - lY).toBeGreaterThan(0);
      const t = (g.deg * Math.PI) / 180;
      const ex = Math.hypot(g.rx * Math.cos(t), g.ry * Math.sin(t)); // the ends are the oval's widest points: the outline is vertical (tangent) there
      expect(rX - g.cx).toBeCloseTo(ex, 0);
      expect(g.cx - lX).toBeCloseTo(ex, 0);
      expect(g.out).toMatch(/class="hero__pod-side-edge"/);
    }
    // the tilted path's two ends: the long axis follows the angle (the right end is lower for a positive angle)
    const ends = /class="hero__pod-top" d="M([\d.-]+) ([\d.-]+)A[^"]*? ([\d.-]+) ([\d.-]+)A/.exec(top({ angle: 38 }).out)!;
    expect(Number(ends[2])).toBeGreaterThan(Number(ends[4]));
  });

  it("the frame keeps the van where it is: with hero.frame the picture area does not depend on the podium, without it the podium widens the area", () => {
    const view = (hero: Record<string, unknown>) => /viewBox="([\d. -]+)"/.exec(heroOf({ hero: { mode: "single", ...hero } }))![1].split(" ").map(Number);
    const frame = { left: -34, right: 122, top: -1.8, bottom: 130 };
    const small = view({ podium: { x: 50, y: 60, scale: 1, ratio: 0.4 }, frame });
    const other = view({ podium: { x: 45, y: 65, scale: 1.4, ratio: 0.3, angle: 3 }, frame });
    expect(other).toEqual(small); // tuning the oval inside the frame moves nothing else
    const plain = view({ podium: { y: 60 }, frame }); // the defaults (scale 1.2, ratio 0.3) fit inside this frame too
    expect(plain).toEqual(small);
    // a podium beyond the frame widens it: nothing is cut off
    const big = view({ podium: { x: 50, y: 60, scale: 3, ratio: 0.4 }, frame });
    expect(big[2]).toBeGreaterThan(small[2]);
    // without a frame the area follows the podium
    expect(view({ podium: { scale: 1.2 } })).not.toEqual(view({ podium: { scale: 2.4 } }));
    // the van is never cut off by a small frame
    const tiny = view({ frame: { left: 20, right: 60, top: 20, bottom: 60 } });
    expect(tiny[0]).toBeLessThanOrEqual(0);
    expect(tiny[0] + tiny[2]).toBeGreaterThanOrEqual(1);
  });

  it("two frames draw the picture twice (the one-screen layout and the rest), with their own ids; one frame draws it once", () => {
    const frame = { left: -50, right: 150, top: -9, bottom: 123 };
    const phoneFrame = { left: -24, right: 136, top: -1.8, bottom: 130 };
    const both = heroOf({ hero: { mode: "single", podium: true, lights: [{ x: 50, y: 50, size: 10 }], frame, phoneFrame } });
    expect(both.match(/<svg class="hero__car/g)).toHaveLength(2);
    expect(both).toMatch(/<svg class="hero__car hero__car--wide"[^>]*preserveAspectRatio="xMidYMid meet"/); // extra height is split above and below
    expect(both).toMatch(/<svg class="hero__car hero__car--narrow"[^>]*preserveAspectRatio="xMidYMax meet"/); // a phone's picture stays on the floor of its box
    const ids = [...both.matchAll(/ id="(hero-[a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length); // no id twice in the page
    const views = [...both.matchAll(/<svg class="hero__car[^"]*" viewBox="([\d. -]+)"/g)].map((m) => m[1]);
    expect(views[0]).not.toBe(views[1]);
    expect(heroOf({ hero: { mode: "single", frame } }).match(/<svg class="hero__car/g)).toHaveLength(1);
    expect(heroOf({ hero: { mode: "single", frame: undefined, phoneFrame } }).match(/<svg class="hero__car/g)).toHaveLength(1);
  });

  it("the phone's picture can have a podium of its own size (phoneScale), the wide one keeps scale", () => {
    const frame = { left: -50, right: 150, top: -9, bottom: 123 };
    const phoneFrame = { left: -28, right: 129, top: -20, bottom: 134 };
    const out = heroOf({ hero: { mode: "single", podium: { scale: 1.5, phoneScale: 1.4 }, frame, phoneFrame } });
    const half = (cls: string) => Number(new RegExp(`<svg class="hero__car ${cls}"[\\s\\S]*?class="hero__pod-top" d="M[\\d.-]+ [\\d.-]+A([\\d.]+) `).exec(out)![1]);
    expect(half("hero__car--wide") / half("hero__car--narrow")).toBeCloseTo(1.5 / 1.4, 3);
  });

  it("the phone's podium can sit lower (phoneY) while its contact shadow stays under the tyres (where y puts it); the wide picture is untouched", () => {
    const frame = { left: -50, right: 150, top: -9, bottom: 123 };
    const phoneFrame = { left: -28, right: 129, top: -20, bottom: 134 };
    const out = heroOf({ hero: { mode: "single", podium: { y: 62, phoneY: 70 }, frame, phoneFrame } });
    const cy = (cls: string, part: string) => {
      const d = new RegExp(`<svg class="hero__car ${cls}"[\\s\\S]*?class="${part}" d="M[\\d.-]+ ([\\d.-]+)A[^"]*? ([\\d.-]+) ([\\d.-]+)A`).exec(out)!;
      return (Number(d[1]) + Number(d[3])) / 2;
    };
    expect(cy("hero__car--narrow", "hero__pod-top")).toBeGreaterThan(cy("hero__car--wide", "hero__pod-top")); // lower on the phone
    expect(cy("hero__car--narrow", "hero__pod-contact")).toBeCloseTo(cy("hero__car--wide", "hero__pod-contact"), 1); // the shadow stays
    // without phoneY the two are the same
    const same = heroOf({ hero: { mode: "single", podium: { y: 62 }, frame, phoneFrame } });
    const top = (cls: string) => /class="hero__pod-top" d="M[\d.-]+ ([\d.-]+)A/.exec(same.split(cls)[1])![1];
    expect(top("hero__car--narrow")).toBe(top("hero__car--wide"));
  });

  it("the raised lettering: a shadow, a light top edge and a face per letter, in capitals, on the rim in its perspective; none without text", () => {
    const on = heroOf({ hero: { mode: "single", podium: { text: "Volkswagen" } } });
    expect(on).toContain('class="hero__pod-engraving"');
    const dark = [...on.matchAll(/<text class="hero__pod-letter"[^>]*transform="matrix\(([^)]+)\)"[^>]*>([^<])<\/text>/g)];
    expect(dark.map((m) => m[2]).join("")).toBe("VOLKSWAGEN");
    expect(on.match(/class="hero__pod-letter-top"/g)).toHaveLength(10);
    const a = dark.map((m) => Number(m[1].split(" ")[0])); // the letters' horizontal scale: full in the middle, foreshortened toward the ends
    expect(Math.max(...a)).toBeGreaterThan(Math.min(a[0], a[a.length - 1]));
    expect(a[0]).toBeCloseTo(a[a.length - 1], 3); // symmetric
    expect(heroOf({ hero: { mode: "single", podium: true } })).not.toContain("hero__pod-engrav");
    expect(heroOf({ hero: { mode: "single", podium: { text: { de: "Wagen", en: "Car" } } } })).toMatch(/>C<\/text>/); // the page's language (en in this fixture)
  });

  it("the engraving is moved along the rim by textOffset, is crisp raised metal (shadow, light top edge, face; no blur) and takes an emblem before the text at the capitals' height", () => {
    const EMBLEM = '<svg viewBox="0 0 100 100"><path fill="currentColor" d="M0 0H100V100H0Z"></path></svg>';
    const render = (podium: Record<string, unknown>, emblem?: string) => {
      const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
      const product = { ...s.product, hero: { mode: "single", podium }, media: { ...s.product.media, heroCutout: true } };
      const site = { ...s, product, podiumEmblem: emblem ?? null, seller: { ...s.seller, agent } as any, avatar: AVATAR } as any;
      return renderToStaticMarkup(<ProductLayout site={site} />);
    };
    const firstX = (out: string) => Number(/class="hero__pod-letter" fill="url\(#hero-metal\)" transform="matrix\([^ ]+ [^ ]+ 0 1 ([\d.-]+) /.exec(out)![1]);
    expect(firstX(render({ text: "AB", textOffset: 4 }))).toBeGreaterThan(firstX(render({ text: "AB" })) + 20); // to the right
    expect(firstX(render({ text: "AB", textOffset: -4 }))).toBeLessThan(firstX(render({ text: "AB" })) - 20);
    const lit = render({ text: "AB" });
    expect(lit).not.toContain("hero__pod-glow");
    expect(lit).not.toMatch(/hero-glow/);
    for (const c of ["hero__pod-letter-shadow", "hero__pod-letter-top", "hero__pod-letter"]) expect(lit.match(new RegExp(`class="${c}"`, "g"))).toHaveLength(2); // two letters in each of the three layers
    expect(lit).toMatch(/class="hero__pod-letter" fill="url\(#hero-metal\)"/);
    expect(lit).not.toContain("hero__pod-emblem");
    const withMark = render({ text: "AB" }, EMBLEM);
    for (const c of ["face", "top", "shadow"]) expect(withMark.match(new RegExp(`<g class="hero__pod-emblem hero__pod-emblem--${c}"`, "g"))).toHaveLength(1);
    // the emblem stands before the first letter, and is as high as the capitals
    const markX = Number(/<g class="hero__pod-emblem hero__pod-emblem--face" fill="url\(#hero-metal-mark\)" transform="matrix\([^ ]+ [^ ]+ 0 1 ([\d.-]+) /.exec(withMark)![1]);
    expect(markX).toBeLessThan(firstX(withMark));
    const size = /<svg x="-([\d.]+)" y="-([\d.]+)" width="([\d.]+)" height="([\d.]+)" viewBox="0 0 100 100"/.exec(withMark)!;
    expect(Number(size[4])).toBeCloseTo(Number(size[2]), 5); // height = the offset above the baseline: it sits on the line
    expect(Number(size[3])).toBeCloseTo(Number(size[4]), 5);
    // an emblem alone (no text) is raised too
    expect(render({}, EMBLEM)).toContain("hero__pod-emblem--face");
  });

  it("the spots: off by default, a count of them evenly round the oval with two flanking the front centre, bigger at the front than at the back, with the content's colour and an optional slow breathing", () => {
    expect(heroOf({ hero: { mode: "single", podium: true } })).not.toContain("hero__led");
    const out = heroOf({ hero: { mode: "single", podium: { leds: { count: 12, colour: "#ffe7bd", breathe: true } } } });
    const spots = [...out.matchAll(/<ellipse class="hero__led-ring" cx="([\d.-]+)" cy="([\d.-]+)" rx="([\d.]+)" ry="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
    expect(spots).toHaveLength(12);
    const front = spots.reduce((a, b) => (b.y > a.y ? b : a));
    const back = spots.reduce((a, b) => (b.y < a.y ? b : a));
    expect(front.r).toBeGreaterThan(back.r); // perspective
    const cx = spots.reduce((s, p) => s + p.x, 0) / spots.length;
    const lowest = [...spots].sort((a, b) => b.y - a.y).slice(0, 2).map((p) => p.x);
    expect(lowest[0] - cx).toBeCloseTo(-(lowest[1] - cx), 0); // two flank the front centre
    expect(out).toContain('--led:#ffe7bd');
    expect(out).toContain('data-breathe="true"');
    expect(out.match(/class="hero__led-halo"/g)).toHaveLength(12);
    expect(out.match(/class="hero__led-pool"/g)).toHaveLength(12);
    expect(heroOf({ hero: { mode: "single", podium: { leds: { count: 6 } } } }).match(/class="hero__led-core"/g)).toHaveLength(6);
    // the lights twinkle by default, each with its own period and start; a glint (thin cross) only on the front lights; twinkle: false leaves them still
    expect(out.match(/data-twinkle="true"/g)).toHaveLength(12);
    const durs = [...out.matchAll(/--tw-dur:([\d.]+)s/g)].map((m) => Number(m[1]));
    const delays = [...out.matchAll(/--tw-delay:(-[\d.]+)s/g)].map((m) => Number(m[1]));
    expect(new Set(durs).size).toBeGreaterThan(6); // different rhythms
    expect(new Set(delays).size).toBeGreaterThan(8); // different starts: never all at once
    expect(Math.min(...durs)).toBeGreaterThanOrEqual(7 * 0.75 - 0.01);
    expect(Math.max(...durs)).toBeLessThanOrEqual(7 * 1.25 + 0.01);
    const glints = out.match(/class="hero__led-glint"/g)!.length;
    expect(glints).toBeGreaterThan(0);
    expect(glints).toBeLessThan(24); // two arms per front light, none at the back
    expect(heroOf({ hero: { mode: "single", podium: { leds: { twinkle: false } } } })).not.toContain("data-twinkle");
    expect(heroOf({ hero: { mode: "single", podium: { leds: { period: 10 } } } })).toMatch(/--tw-dur:(7\.[5-9]\d|[89]\.\d\d|1[0-2]\.\d\d)s/);
    expect(heroOf({ hero: { mode: "single", podium: { leds: true } } })).not.toContain("data-breathe");
    expect(heroOf({ hero: { mode: "single", podium: { leds: false } } })).not.toContain("hero__led");
  });

  it("the lights come from the content: a glow per point, in the photo's own coordinates, hidden from a reader; none without them", () => {
    const hero = heroOf({ hero: { mode: "single", lights: [{ x: 50, y: 50, size: 20, aspect: 2, angle: 10 }, { x: 10, y: 20, size: 5 }] } });
    const lights = [...hero.matchAll(/<ellipse class="hero__light" cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" transform="rotate\(([\d.]+) [\d.]+ [\d.]+\)" fill="url\(#hero-light\)" aria-hidden="true"/g)];
    expect(lights).toHaveLength(2);
    const [cx, cy, rx, ry, angle] = lights[0].slice(1).map(Number);
    expect(cx / (cx * 2)).toBe(0.5); // x 50% of the width
    expect(rx / ry).toBeCloseTo(2, 5); // the aspect
    expect(angle).toBe(10);
    expect(cy).toBeGreaterThan(0);
    expect(heroOf({ hero: { mode: "single" } })).not.toContain("hero__light");
  });

  it("is ignored without the agent's card and without a cut-out; the tiles hero keeps today's markup", () => {
    expect(heroOf({ hero: { mode: "single", podium: true }, card: false })).not.toContain("hero__car");
    expect(heroOf({ hero: { mode: "single", podium: true }, cutout: false })).not.toContain("hero__pod-top");
    const tiles = heroOf({});
    expect(tiles).not.toContain("hero__car");
    expect(tiles).not.toContain('data-mode="single"');
    expect(tiles).toContain('class="hero__image"');
  });
});

describe("the podium emblem file", () => {
  const fs2 = fs;
  const copy = () => {
    const dir = fs2.mkdtempSync(path.join(os.tmpdir(), "emblem-"));
    fs2.cpSync(FIXTURE_DIR, dir, { recursive: true });
    return dir;
  };
  const withEmblem = (dir: string, file: string | null, svg?: string) => {
    const pj = path.join(dir, fixtures.seller, "fixture-car", "product.json");
    const product = JSON.parse(fs2.readFileSync(pj, "utf8"));
    product.hero = { ...(product.hero ?? {}), mode: "single", podium: { emblem: "emblem.svg" } };
    fs2.writeFileSync(pj, JSON.stringify(product));
    if (svg !== undefined) fs2.writeFileSync(path.join(dir, fixtures.seller, "fixture-car", "emblem.svg"), svg);
    return file;
  };
  it("is read next to product.json, checked like the logo and inlined; a missing file stops the load, a script is refused", async () => {
    const { loadProduct } = await import("@/lib/content");
    const ok = copy();
    withEmblem(ok, "emblem.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0H10V10Z"/></svg>');
    const loaded = loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: ok });
    expect(loaded.podiumEmblem).toMatch(/^<svg [^>]*viewBox="0 0 10 10"[^>]*><path [^>]*d="M0 0H10V10Z"/);
    const missing = copy();
    withEmblem(missing, null);
    expect(() => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: missing })).toThrow(/emblem\.svg.*not found/);
    expect(loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: missing, strictMedia: false }).podiumEmblem).toBeNull();
    const bad = copy();
    withEmblem(bad, "emblem.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>');
    expect(() => loadProduct(`${fixtures.seller}/fixture-car`, { contentDir: bad })).toThrow(/emblem\.svg/);
    for (const d of [ok, missing, bad]) fs2.rmSync(d, { recursive: true, force: true });
  });

  it("is in the real content: the reference site's emblem as plain shapes in one colour", async () => {
    const { hasRealContent, content } = await import("./helpers");
    if (!hasRealContent) return;
    expect(content.sampleJson("vw-multivan").hero.podium.emblem).toBe("podium-emblem.svg");
    const text = fs2.readFileSync(path.join(content.productDir("vw-multivan"), "podium-emblem.svg"), "utf8");
    expect(text).toMatch(/viewBox="0 0 1600 1600"/);
    expect(text).toContain('fill="currentColor"');
    expect(text.length).toBeLessThan(8000);
  });
});

describe("the single hero's styles", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("blinks softly: two flashes in an eight-second loop, then a long pause; nothing moves under reduced motion", () => {
    expect(clean).toMatch(/\.hero__light\s*\{[^}]*animation: hero-light 8s ease-in-out infinite/);
    const frames = /@keyframes hero-light\s*\{([\s\S]*?)\n\}/.exec(clean)![1];
    const peaks = [...frames.matchAll(/(\d+)%\s*\{\s*opacity:\s*([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.max(...peaks.map((p) => p[1]))).toBeLessThanOrEqual(0.85); // soft, never full
    expect(peaks.filter(([, o]) => o >= 0.5)).toHaveLength(2); // two flashes
    expect(clean).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.hero__light\s*\{\s*animation: none;/);
  });

  it("the one-screen hero's headline is one step smaller, never larger than the theme's size and not below 2.7rem; the stage is pulled up under the eyebrow", () => {
    const one = /@media \(min-width: 56em\) and \(min-height: 37\.5em\) \{\s*\.hero\[data-card\]\[data-layout="podium"\] \.hero__lead-in \{[\s\S]*?\n\}\n/.exec(css)![0];
    expect(one).toMatch(/font-size: min\(var\(--hero-headline-size, clamp\(1\.9rem, 4vw, 3\.25rem\)\), max\(calc\(var\(--hero-headline-size, clamp\(1\.9rem, 4vw, 3\.25rem\)\) \* 0\.9\), 2\.7rem\)\)/);
    expect(one).toMatch(/\.hero__stage \{\s*margin-top: -[\d.]+rem;/);
    expect(one).toMatch(/\.hero__lead-in \{\s*padding-block: var\(--space-2\) 0;/);
  });

  it("hides the engraving on a small phone, and the spots' breathing is off under reduced motion", () => {
    expect(clean).toMatch(/@media \(max-width: 24em\) \{\s*\.hero__pod-engraving \{\s*display: none;/);
    expect(clean).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hero__leds\[data-breathe\],\s*\.hero__led\[data-twinkle\] \.hero__led-glint,\s*\.hero__led\[data-twinkle\] \.hero__led-halo,\s*\.hero__led\[data-twinkle\] \.hero__led-core \{\s*animation: none;/);
    expect(clean).toMatch(/\.hero__leds\[data-breathe\] \{\s*animation: hero-led-breathe 7s/);
  });

  it("uses the theme's colours only (a podium token with a fallback, the card's stage and ink), and no container queries", () => {
    expect(clean).toMatch(/--pod-surface: var\(--hero-podium, color-mix\(in srgb, var\(--avatar-stage, var\(--surface\)\)/);
    const block = /\.hero__pod-top-a \{[\s\S]*?\.hero__light-d \{[^}]*\}/.exec(clean)![0];
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(clean).not.toMatch(/container-type|\bcq[wh]\b|\d\s*cq[wh]/);
  });

  it("both bundled themes set the podium's top colour", () => {
    for (const t of ["light-editorial", "dark-premium"]) expect(fs.readFileSync(path.join("public", "themes", `${t}.css`), "utf8"), t).toMatch(/--hero-podium:/);
  });
});

describe("the Multivan's podium in the real content", () => {
  it("is the owner's layout: an almost level oval (0-3 degrees), about 70% of the photo-column wide and 0.37 flat, a rim 1.5 times the first one, in a frame that hugs the group with equal side margins and equal top and bottom room", async () => {
    const { hasRealContent, content } = await import("./helpers");
    if (!hasRealContent) return;
    const hero = content.sampleJson("vw-multivan").hero;
    expect(hero.mode).toBe("single");
    expect(Math.abs(hero.podium.angle)).toBeLessThanOrEqual(3);
    expect(hero.podium.ratio).toBeGreaterThan(0.33);
    expect(hero.podium.ratio).toBeLessThan(0.42);
    expect(hero.podium.scale).toBeGreaterThan(1.3);
    expect(hero.podium.scale).toBeLessThan(1.7);
    expect(hero.podium.thickness).toBeCloseTo(3.5 * 1.5, 2); // the rim is 1.5 times as thick as the first one
    expect(hero.podium.text).toBe("Volkswagen"); // the brand, engraved on the rim
    expect(hero.podium.leds.count).toBeGreaterThanOrEqual(10);
    expect(hero.podium.leds.count).toBeLessThanOrEqual(12);
    // the van rides about 1% of the panel height higher on the oval: the oval is lower than the contact shadow's anchor by ~1.4% of the photo
    expect(hero.podium.y - hero.podium.shadowY).toBeGreaterThan(0.8);
    expect(hero.podium.y - hero.podium.shadowY).toBeLessThan(2.2);
    expect(hero.podium.x).toBeGreaterThan(46); // right of the footprint's centre (about 44% of the photo), so that the van stands in the middle of the platform
    expect(hero.podium.x).toBeLessThan(58);
    // the panel hugs the group: the frame is centred on the oval, so the side margins are equal
    expect((hero.frame.left + hero.frame.right) / 2).toBeCloseTo(hero.podium.x, 0);
    // the group is centred vertically: the room above the van's top row (6 units into the 963-unit photo) equals the room under the rim
    const W = 1423, H = 963;
    const rx = (hero.podium.scale * W) / 2;
    const ry = rx * hero.podium.ratio;
    const t = (hero.podium.angle * Math.PI) / 180;
    const bottom = (hero.podium.y / 100) * H + Math.hypot(rx * Math.sin(t), ry * Math.cos(t)) + (hero.podium.thickness / 100) * 2 * rx;
    const above = 6 - (hero.frame.top / 100) * H;
    const below = (hero.frame.bottom / 100) * H - bottom;
    expect(Math.abs(above - below)).toBeLessThan(0.01 * H); // within 1% of the photo's height (a few pixels)
    // the phone has its own frame, centred on the oval too (equal side margins), and a podium a little smaller against the van (the oval grows 80% of the van's growth)
    expect(hero.phoneFrame.right - hero.phoneFrame.left).toBeLessThan(hero.frame.right - hero.frame.left);
    expect((hero.phoneFrame.left + hero.phoneFrame.right) / 2).toBeCloseTo(hero.podium.x, 0);
    expect(hero.podium.phoneScale).toBeLessThan(hero.podium.scale);
    expect(hero.podium.phoneScale).toBeGreaterThan(0.9 * hero.podium.scale);
    // the phone's podium sits lower than the desktop's (more surface in front of the bumper) while the van stays where the frame puts it; there is room under its rim
    expect(hero.podium.phoneY).toBeGreaterThan(hero.podium.y);
    expect(hero.podium.phoneY - hero.podium.y).toBeLessThan(12);
    const phoneBelow = (hero.phoneFrame.bottom / 100) * H - ((hero.podium.phoneY / 100) * H + Math.hypot(rx * Math.sin(t), ry * Math.cos(t)) * (hero.podium.phoneScale / hero.podium.scale) + (hero.podium.thickness / 100) * hero.podium.phoneScale * W);
    expect(phoneBelow).toBeGreaterThan(0.05 * H); // not cut off
    const frameRatio = ((hero.phoneFrame.right - hero.phoneFrame.left) * W) / ((hero.phoneFrame.bottom - hero.phoneFrame.top) * H);
    expect(frameRatio).toBeCloseTo(1.5, 1); // the panel's ratio: the picture fills it exactly
    expect(hero.floor).toBeUndefined();
  });
});
