import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { deepEqual, migrate, removeMembers, topLevelMembers } from "../scripts/migrate-content.mjs";
import { validateSeller } from "@/lib/seller";
import { loadProduct } from "@/lib/content";
import { fixtures } from "./helpers";

const tmp = path.join(process.cwd(), ".test-tmp", "migrate");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const OLD = { brand: "Dummy Brand", languages: ["de", "en"], theme: "light-editorial", contact: { email: "x@example.invalid", consentText: { en: "I agree.", de: "Ich stimme zu." } } };

let counter = 0;
/** An old-layout content root: <product>/product.json holding the moved fields (the fixture product plus OLD), with its media folder. */
function oldRoot(products: Record<string, Record<string, unknown>> = { "dummy-one": {} }) {
  const root = path.join(tmp, `case-${++counter}`);
  for (const [slug, extra] of Object.entries(products)) {
    const rest = { ...fixtures.sampleJson("fixture-car") };
    delete rest.theme;
    const data = { ...rest, slug, theme: OLD.theme, brand: OLD.brand, languages: OLD.languages, ...extra, contact: (extra.contact as object) ?? OLD.contact };
    fs.mkdirSync(path.join(root, slug), { recursive: true });
    // the moved fields sit where the old files had them: contact last
    const { contact, ...others } = data as Record<string, unknown>;
    fs.writeFileSync(path.join(root, slug, "product.json"), JSON.stringify({ ...others, contact }, null, 2) + "\n");
    fs.cpSync(path.join(fixtures.productDir("fixture-car"), "media"), path.join(root, slug, "media"), { recursive: true });
  }
  return root;
}

describe("removing members from JSON text", () => {
  const text = '{\n  "a": 1,\n  "brand": "x",\n  "list": [1,\n    2],\n  "contact": {\n    "email": "e, \\"q\\"",\n    "n": { "k": [1, 2] }\n  }\n}\n';

  it("finds the top-level members, with strings, brackets and escaped quotes inside the values", () => {
    expect(topLevelMembers(text).map((m) => m.name)).toEqual(["a", "brand", "list", "contact"]);
  });

  it("cuts a member in the middle and keeps every other byte", () => {
    expect(removeMembers(text, ["brand"])).toBe('{\n  "a": 1,\n  "list": [1,\n    2],\n  "contact": {\n    "email": "e, \\"q\\"",\n    "n": { "k": [1, 2] }\n  }\n}\n');
  });

  it("cuts the last member and the comma before it", () => {
    expect(removeMembers(text, ["contact"])).toBe('{\n  "a": 1,\n  "brand": "x",\n  "list": [1,\n    2]\n}\n');
  });

  it("cuts several members at once, also the first and the last", () => {
    const out = removeMembers(text, ["a", "brand", "contact"]);
    expect(JSON.parse(out)).toEqual({ list: [1, 2] });
    expect(out).toBe('{\n  "list": [1,\n    2]\n}\n');
  });

  it("ignores a name that is not there", () => {
    expect(removeMembers(text, ["nope"])).toBe(text);
  });

  it("compares objects by value", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });
});

describe("migrating a content root", () => {
  it("a dry run changes nothing and prints counts and names only", () => {
    const root = oldRoot();
    const before = walk(root).map((f) => [f, sha(f)]);
    const lines: string[] = [];
    const r = migrate({ root, seller: "dummy-seller", log: (l: string) => lines.push(l) });
    expect(r.written).toBe(false);
    expect(walk(root).map((f) => [f, sha(f)])).toEqual(before);
    const out = lines.join("\n");
    expect(out).toMatch(/products: 1 \(dummy-one\)/);
    expect(out).toMatch(/dry run/);
    for (const value of [OLD.brand, OLD.contact.email, "I agree."]) expect(out).not.toContain(value); // never a value
  });

  it("moves the folders by rename: same files, same bytes, the same inodes", () => {
    const root = oldRoot({ "dummy-one": {}, "dummy-two": {} });
    const media = path.join(root, "dummy-one", "media", "hero.jpg");
    const inode = fs.statSync(media).ino;
    const hashes = new Map(walk(path.join(root, "dummy-one", "media")).map((f) => [path.relative(path.join(root, "dummy-one"), f), sha(f)]));
    const r = migrate({ root, seller: "dummy-seller", write: true });
    expect(r.written).toBe(true);
    expect(fs.existsSync(path.join(root, "dummy-one"))).toBe(false);
    const moved = path.join(root, "dummy-seller", "dummy-one", "media", "hero.jpg");
    expect(fs.statSync(moved).ino).toBe(inode); // a rename, not a copy
    for (const [rel, hash] of hashes) expect(sha(path.join(root, "dummy-seller", "dummy-one", rel))).toBe(hash);
    expect(fs.readdirSync(path.join(root, "dummy-seller")).sort()).toEqual(["dummy-one", "dummy-two", "seller.json"]);
  });

  it("writes a valid seller.json from the moved fields, and the product loses exactly those fields", () => {
    const root = oldRoot();
    const original = fs.readFileSync(path.join(root, "dummy-one", "product.json"), "utf8");
    migrate({ root, seller: "dummy-seller", write: true });
    const seller = JSON.parse(fs.readFileSync(path.join(root, "dummy-seller", "seller.json"), "utf8"));
    expect(validateSeller(seller).ok).toBe(true);
    expect(seller).toMatchObject({ schemaVersion: 1, displayName: OLD.brand, contact: { email: OLD.contact.email }, languages: ["de", "en"], defaultLanguage: "en", theme: OLD.theme, consentText: OLD.contact.consentText });
    expect(seller.legalNote.en).toMatch(/does not constitute a binding offer/);
    expect(seller.legalNote.de).toMatch(/verbindliches Angebot/);

    const text = fs.readFileSync(path.join(root, "dummy-seller", "dummy-one", "product.json"), "utf8");
    const oldData = JSON.parse(original);
    const newData = JSON.parse(text);
    expect(Object.keys(oldData).filter((k) => !(k in newData)).sort()).toEqual(["brand", "contact", "languages", "theme"]);
    for (const k of Object.keys(newData)) expect(newData[k]).toEqual(oldData[k]); // everything else is unchanged
    // byte for byte: the new text is the old text with those members cut out (contact was last, so the comma before it went too)
    expect(text).toBe(removeMembers(original, ["brand", "contact", "languages", "theme"]));
    expect(text.endsWith("\n")).toBe(true);
  });

  it("the seller and the product together give back the original data, and the loader accepts the result", () => {
    const root = oldRoot();
    const oldData = JSON.parse(fs.readFileSync(path.join(root, "dummy-one", "product.json"), "utf8"));
    migrate({ root, seller: "dummy-seller", write: true });
    const loaded = loadProduct("dummy-seller/dummy-one", { contentDir: root });
    const { theme, brand, languages, contact, ...rest } = oldData;
    expect(loaded.product).toMatchObject(rest);
    expect(loaded.product.theme).toBe(theme);
    expect(loaded.product.languages).toEqual(languages);
    expect(loaded.product.defaultLanguage).toBe("en"); // "de" was first, but the fixture has texts that are English only: the default must be complete
    expect(loaded.product.contact.email).toBe(contact.email);
    expect(loaded.seller.displayName).toBe(brand);
    expect(loaded.seller.consentText).toEqual(contact.consentText);
    expect(loaded.images["hero.jpg"].src).toBe("/media/dummy-seller/dummy-one/hero.jpg");
  });

  it("stops when contact differs between products, names the field and the products, and prints no value", () => {
    const root = oldRoot({ "dummy-one": {}, "dummy-two": { contact: { email: "other@example.invalid", consentText: { en: "Other." } } } });
    const before = walk(root).map((f) => [f, sha(f)]);
    let message = "";
    try {
      migrate({ root, seller: "dummy-seller", write: true });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Cannot group these products under one seller: contact \(differs between: dummy-two, dummy-one\)/);
    for (const value of [OLD.contact.email, "other@example.invalid", "Other."]) expect(message).not.toContain(value);
    expect(walk(root).map((f) => [f, sha(f)])).toEqual(before); // nothing was touched
  });

  it("stops on a different brand or languages too", () => {
    const a = oldRoot({ "dummy-one": {}, "dummy-two": { brand: "Another Brand" } });
    expect(() => migrate({ root: a, seller: "dummy-seller" })).toThrow(/brand \(differs/);
    const b = oldRoot({ "dummy-one": {}, "dummy-two": { languages: ["en"] } });
    expect(() => migrate({ root: b, seller: "dummy-seller" })).toThrow(/languages \(differs/);
  });

  it("different themes need --theme; the product with another theme keeps it as its override", () => {
    const root = oldRoot({ "dummy-one": {}, "dummy-two": { theme: "dark-premium" } });
    expect(() => migrate({ root, seller: "dummy-seller" })).toThrow(/pass --theme <name>/);
    migrate({ root, seller: "dummy-seller", theme: "light-editorial", write: true });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dummy-seller", "seller.json"), "utf8")).theme).toBe("light-editorial");
    expect(JSON.parse(fs.readFileSync(path.join(root, "dummy-seller", "dummy-one", "product.json"), "utf8")).theme).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(root, "dummy-seller", "dummy-two", "product.json"), "utf8")).theme).toBe("dark-premium");
    expect(loadProduct("dummy-seller/dummy-two", { contentDir: root }).product.theme).toBe("dark-premium");
    expect(loadProduct("dummy-seller/dummy-one", { contentDir: root }).product.theme).toBe("light-editorial");
  });

  it("without a brand anywhere it needs --display-name, and never guesses one", () => {
    const root = oldRoot();
    const file = path.join(root, "dummy-one", "product.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    delete data.brand;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    expect(() => migrate({ root, seller: "dummy-seller" })).toThrow(/pass --display-name <text>/);
    migrate({ root, seller: "dummy-seller", displayName: "Given Name", write: true });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dummy-seller", "seller.json"), "utf8")).displayName).toBe("Given Name");
  });

  it("needs --seller, refuses an existing seller folder and a product named like the seller", () => {
    const root = oldRoot();
    expect(() => migrate({ root, seller: "" })).toThrow(/Pass --seller/);
    expect(() => migrate({ root, seller: "Bad Slug" })).toThrow(/Pass --seller/);
    expect(() => migrate({ root, seller: "dummy-one" })).toThrow(/already named/);
    fs.mkdirSync(path.join(root, "taken"));
    expect(() => migrate({ root, seller: "taken" })).toThrow(/already exists/);
  });

  it("says so when there is nothing to migrate (already migrated)", () => {
    const root = oldRoot();
    migrate({ root, seller: "dummy-seller", write: true });
    expect(() => migrate({ root, seller: "another-seller" })).toThrow(/No old-layout product/);
  });

  it("the migrated example-style root loads with the current loader (a root without any brand)", () => {
    const root = oldRoot();
    const file = path.join(root, "dummy-one", "product.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    delete data.brand;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    migrate({ root, seller: "dummy-seller", displayName: "Example Seller", write: true });
    expect(loadProduct("dummy-seller/dummy-one", { contentDir: root }).seller.displayName).toBe("Example Seller");
  });
});
