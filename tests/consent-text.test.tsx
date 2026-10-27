// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { consentPointsToPrivacy } from "@/components/ContactForm";
import ProductLayout from "@/components/ProductLayout";
import { buildSite } from "@/lib/site";
import { textFiles } from "../scripts/lib/content-scan.mjs";
import { examples, FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let box: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
});

/** The consent label of the dialog's form for a seller with the given consent text and privacy URL. */
function consentLabel(lang: "de" | "en", consent: string, privacyUrl?: string) {
  const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
  const seller = { ...s.seller, consentText: { ...s.seller.consentText, [lang]: consent }, privacyUrl };
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={{ ...s, seller }} />));
  return box.querySelector(".contact__consent label") as HTMLLabelElement;
}

describe("the privacy link in the consent text", () => {
  it("is appended after the text when the seller has a privacy page", () => {
    const label = consentLabel("en", "I agree that my details are used to answer my enquiry.", "https://example.invalid/privacy");
    expect(label.textContent).toContain("enquiry. Privacy");
    expect(label.querySelectorAll("a")).toHaveLength(1);
    expect(label.querySelector("a")!.getAttribute("href")).toBe("https://example.invalid/privacy");
  });

  it("is not appended when the seller has no privacy page: no link and no placeholder anchor", () => {
    for (const lang of ["en", "de"] as const) {
      const label = consentLabel(lang, "Example consent text.", undefined);
      expect(label.querySelector("a")).toBeNull();
      expect(label.textContent).not.toContain("#privacy");
      expect(label.textContent).not.toMatch(/Privacy|Datenschutz/);
    }
  });

  it("is not appended again when the text already contains its target or its label", () => {
    const url = "https://example.invalid/privacy";
    expect(consentLabel("en", `See ${url} for details.`, url).querySelector("a")).toBeNull();
    expect(consentLabel("en", "More in our Privacy page.", url).querySelector("a")).toBeNull();
    expect(consentLabel("de", "Mehr unter Datenschutz.", url).querySelector("a")).toBeNull();
  });

  it("is still appended after a sentence that only says 'privacy notice' or 'Datenschutzerklärung' (that is not the link)", () => {
    const url = "https://example.invalid/privacy";
    expect(consentLabel("en", "More in the privacy notice.", url).querySelector("a")!.getAttribute("href")).toBe(url);
    expect(consentLabel("de", "Mehr dazu in der Datenschutzerklärung.", url).querySelector("a")!.getAttribute("href")).toBe(url);
    expect(consentPointsToPrivacy("More in the privacy notice.", "Privacy", url)).toBe(false);
    expect(consentPointsToPrivacy("Privacy", "Privacy", url)).toBe(true);
    expect(consentPointsToPrivacy("Privacy policy", "Privacy", url)).toBe(true);
    expect(consentPointsToPrivacy("Datenschutzerklärung", "Datenschutz", url)).toBe(false);
  });
});

describe("no example or fixture text carries the literal anchor", () => {
  it('"(#privacy)" appears nowhere in examples/, tests/fixtures or src/', () => {
    const files = [...textFiles(path.join(process.cwd(), "examples")), ...textFiles(path.join(process.cwd(), "tests", "fixtures")), ...textFiles(path.join(process.cwd(), "src"))];
    expect(files.length).toBeGreaterThan(20);
    const hits = files.filter((f) => fs.readFileSync(f, "utf8").includes("(#privacy)")).map((f) => path.relative(process.cwd(), f));
    expect(hits).toEqual([]);
    for (const seller of [examples.sellerJson(), fixtures.sellerJson()]) for (const text of Object.values(seller.consentText as Record<string, string>)) expect(text).not.toContain("#privacy");
  });

  it("the page never links a #privacy anchor", () => {
    const s = buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, "en");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root!.render(<ProductLayout site={s} />));
    expect(box.innerHTML).not.toContain("#privacy");
  });
});
