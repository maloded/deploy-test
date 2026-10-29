import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ContentError } from "@/lib/content";
import { validateSeller } from "@/lib/seller";
import { fixtures, inRoot } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "agent-avatar-seller");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const root = path.join(tmp, "content");
fs.cpSync(fixtures.root, root, { recursive: true });
const here = inRoot(root, fixtures.seller);
const slug = fs.readdirSync(path.join(root, fixtures.seller)).find((d) => fs.existsSync(path.join(root, fixtures.seller, d, "product.json")))!;

const pack = (id: string, extra: object = {}) => {
  const dir = path.join(root, "_avatars", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "avatar.json"), JSON.stringify({ schema: 1, id, name: `Name of ${id}`, poster: "poster.webp", license: "Synthetic", provenance: "Generated for the tests", ...extra }));
  fs.writeFileSync(path.join(dir, "poster.webp"), Buffer.alloc(10));
};
const setAgent = (agent: object | undefined) => {
  const file = path.join(root, fixtures.seller, "seller.json");
  const seller = { ...here.sellerJson() };
  if (agent) seller.agent = agent;
  else delete seller.agent;
  fs.writeFileSync(file, JSON.stringify(seller));
};
const parse = (avatar: unknown) => validateSeller({ ...fixtures.sellerJson(), agent: { id: "x", avatar } });

describe("agent.avatar in seller.json", () => {
  it("takes an id and an optional name, nothing else", () => {
    const r = parse({ id: "some-pack", name: "Label" });
    expect(r.ok && r.seller.agent?.avatar).toEqual({ id: "some-pack", name: "Label" });
    const only = parse({ id: "some-pack" });
    expect(only.ok && only.seller.agent?.avatar).toEqual({ id: "some-pack" });
  });

  it("is strict: no file names, no unknown keys, no bad ids", () => {
    expect(parse({ id: "p", poster: "poster.webp" }).ok).toBe(false);
    expect(parse({ id: "p", file: "a.mp4" }).ok).toBe(false);
    expect(parse({}).ok).toBe(false);
    expect(parse({ id: "../p" }).ok).toBe(false);
    expect(parse({ id: "P" }).ok).toBe(false);
    expect(parse({ id: "p", name: "" }).ok).toBe(false);
    expect(parse("some-pack").ok).toBe(false);
  });

  it("refuses an unknown key next to the id in the agent object as before", () => {
    expect(validateSeller({ ...fixtures.sellerJson(), agent: { id: "x", avatarId: "p" } }).ok).toBe(false);
  });
});

describe("loading a product whose seller has an avatar", () => {
  it("resolves the pack to URLs for the card", () => {
    pack("pack-one", { listen: "l.mp4", speak: { mp4: "s.mp4", webm: "s.webm" } });
    for (const f of ["l.mp4", "s.mp4", "s.webm"]) fs.writeFileSync(path.join(root, "_avatars", "pack-one", f), Buffer.alloc(10));
    setAgent({ id: "x", avatar: { id: "pack-one" } });
    expect(here.loadFor(slug).avatar).toEqual({
      id: "pack-one",
      name: "Name of pack-one",
      poster: "/avatars/pack-one/poster.webp",
      idle: null,
      listen: { mp4: "/avatars/pack-one/l.mp4" },
      speak: { mp4: "/avatars/pack-one/s.mp4", webm: "/avatars/pack-one/s.webm" },
      caption: null,
      startLabel: null,
      endLabel: null,
    });
  });

  it("uses the seller's name for the card when there is one", () => {
    pack("pack-two");
    setAgent({ id: "x", avatar: { id: "pack-two", name: "Ask our assistant" } });
    expect(here.loadFor(slug).avatar?.name).toBe("Ask our assistant");
  });

  it("an unknown id is an error that names the id and the library path", () => {
    setAgent({ id: "x", avatar: { id: "not-there" } });
    let error: unknown;
    try {
      here.loadFor(slug);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).issues.join("\n")).toContain(`agent.avatar.id: avatar "not-there" is not in the avatar library ${path.join(root, "_avatars")}`);
    expect((error as ContentError).message).toContain("seller.json");
  });

  it("a broken pack stops the load too (a missing file)", () => {
    pack("pack-broken", { idle: "gone.mp4" });
    setAgent({ id: "x", avatar: { id: "pack-broken" } });
    expect(() => here.loadFor(slug)).toThrow(/file "gone.mp4" not found/);
  });

  it("without agent.avatar nothing changes: avatar is null and the agent object is as before", () => {
    setAgent({ id: "x", placement: "top" });
    const loaded = here.loadFor(slug);
    expect(loaded.avatar).toBeNull();
    expect(loaded.seller.agent).toEqual({ id: "x", placement: "top", variant: "pill", voiceServiceUrl: "https://voice.hanc.ai" });
    setAgent(undefined);
    expect(here.loadFor(slug).avatar).toBeNull();
  });

  it("an avatar that is not used is not looked up (no agent, no library needed)", () => {
    fs.rmSync(path.join(root, "_avatars"), { recursive: true, force: true });
    setAgent(undefined);
    expect(() => here.loadFor(slug)).not.toThrow();
  });
});

describe("the button labels (agent.avatar.startLabel and .endLabel)", () => {
  const LABELS = { startLabel: { en: "Talk to Sofia", de: "Mit Sofia sprechen" }, endLabel: { en: "Hang up", de: "Auflegen" } };

  it("are optional, localized and strict", () => {
    expect(parse({ id: "some-pack", ...LABELS }).ok).toBe(true);
    expect(parse({ id: "some-pack" }).ok).toBe(true);
    expect(parse({ id: "some-pack", startLabel: "plain" }).ok).toBe(false);
    expect(parse({ id: "some-pack", endLabel: { xx: "nope" } }).ok).toBe(false);
    expect(parse({ id: "some-pack", connectLabel: { en: "x" } }).ok).toBe(false);
  });

  it("reach the card, null when the seller wrote none, and count in the translation coverage", () => {
    pack("pack-labels");
    setAgent({ id: "x", avatar: { id: "pack-labels", ...LABELS } });
    expect(here.loadFor(slug).avatar).toMatchObject(LABELS);
    setAgent({ id: "x", avatar: { id: "pack-labels" } });
    expect(here.loadFor(slug).avatar).toMatchObject({ startLabel: null, endLabel: null });
    setAgent({ id: "x", avatar: { id: "pack-labels", startLabel: { en: "Only English" } } });
    expect(here.loadFor(slug).translationWarnings.filter((w) => w.includes("agent.avatar.startLabel"))).not.toHaveLength(0);
  });
});

describe("the caption texts (agent.avatar.tagline and .badge)", () => {
  const TEXTS = { tagline: { en: "Happy to tell you more or help.", de: "Gern erzähle ich mehr oder helfe weiter." }, badge: { en: "AI assistant", de: "KI-Assistent" } };

  it("are optional, localized and strict: a plain string, an unknown language or an unknown key is refused", () => {
    expect(parse({ id: "some-pack", ...TEXTS }).ok).toBe(true);
    expect(parse({ id: "some-pack", tagline: "plain" }).ok).toBe(false);
    expect(parse({ id: "some-pack", badge: { xx: "nope" } }).ok).toBe(false);
    expect(parse({ id: "some-pack", caption: "x" }).ok).toBe(false);
    expect(parse({ id: "some-pack", badge: {} }).ok).toBe(false);
  });

  it("reach the card as localized texts; one of them is enough, none means no caption", () => {
    pack("pack-caption");
    setAgent({ id: "x", avatar: { id: "pack-caption", ...TEXTS } });
    expect(here.loadFor(slug).avatar?.caption).toEqual(TEXTS);
    setAgent({ id: "x", avatar: { id: "pack-caption", badge: TEXTS.badge } });
    expect(here.loadFor(slug).avatar?.caption).toEqual({ tagline: null, badge: TEXTS.badge });
    setAgent({ id: "x", avatar: { id: "pack-caption" } });
    expect(here.loadFor(slug).avatar?.caption).toBeNull();
  });

  it("count in the translation coverage: a missing language is reported and falls back to the default language", () => {
    pack("pack-caption");
    setAgent({ id: "x", avatar: { id: "pack-caption", tagline: { en: "Only English." } } });
    const loaded = here.loadFor(slug);
    const warnings = loaded.translationWarnings.filter((w) => w.includes("agent.avatar.tagline"));
    const offered = loaded.product.languages.filter((l) => l !== loaded.product.defaultLanguage);
    expect(warnings).toHaveLength(offered.length);
    for (const l of loaded.product.languages) expect(loaded.avatar?.caption?.tagline?.[l]).toBe(loaded.avatar?.caption?.tagline?.[loaded.product.defaultLanguage]);
  });
});
