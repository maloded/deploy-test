// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// happy-dom cannot measure layout: these tests read the CSS rules. The real measurement is made in a browser (see the
// "Contact dialog layout" notes in PROGRESS.md for the numbers).
const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
const body = (selector: string) => rules.filter((r) => r.selector === selector).map((r) => r.body).join("\n");
const form = fs.readFileSync(path.join(process.cwd(), "src", "components", "ContactForm.tsx"), "utf8");
const section = fs.readFileSync(path.join(process.cwd(), "src", "components", "ContactSection.tsx"), "utf8");

describe("the dialog never exceeds the window and only its body scrolls", () => {
  it("the dialog is at most the viewport high (dvh), centred, and clips to its rounded box without scrolling itself", () => {
    const d = body(".contact-dialog");
    expect(d).toMatch(/max-height: calc\(100dvh - 2 \* var\(--space-3\)\)/);
    expect(d).toMatch(/margin: auto/);
    expect(d).toMatch(/overflow: hidden/);
    expect(d).not.toMatch(/overflow(-y)?: (auto|scroll)/);
    expect(body(".contact-dialog[open]")).toMatch(/display: flex/);
  });

  it("overflow-y: auto is on the body wrapper only", () => {
    expect(body(".contact-dialog__body")).toMatch(/overflow-y: auto/);
    const scrolling = rules.filter((r) => /overflow(-y)?: (auto|scroll)/.test(r.body) && /contact/.test(r.selector));
    expect(scrolling.map((r) => r.selector)).toEqual([".contact-dialog__body"]);
    expect(body(".contact-dialog__box")).toMatch(/min-height: 0/); // lets the flex child shrink so the body, not the page, scrolls
    expect(body(".contact-dialog__body")).toMatch(/min-height: 0/);
  });

  it("the title row with the close button is a fixed first row outside the scrolling body", () => {
    expect(body(".contact-dialog__bar")).toMatch(/flex: none/);
    expect(section).toMatch(/<div className="contact-dialog__bar">[\s\S]*<\/div>\s*\{\/\* only this body scrolls[\s\S]*<div className="contact-dialog__body">/);
    // the close button and the title are inside the bar, the form inside the body
    const bar = section.slice(section.indexOf('className="contact-dialog__bar"'), section.indexOf('className="contact-dialog__body"'));
    expect(bar).toContain("contact-dialog__close");
    expect(bar).toContain("contact-dialog__title");
    expect(bar).not.toContain("<ContactForm");
  });

  it("the page behind does not scroll with the body, and the scrollbar is thin and uses theme variables only", () => {
    const b = body(".contact-dialog__body");
    expect(b).toMatch(/overscroll-behavior: contain/);
    expect(b).toMatch(/scrollbar-width: thin/);
    expect(b).toMatch(/scrollbar-color: var\(--[a-z-]+\) var\(--[a-z-]+\)/);
    expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("the dialog body and bar use theme spacing variables and rem only (no raw pixel sizes; a 1px hairline border is fine)", () => {
    for (const selector of [".contact-dialog", ".contact-dialog__box", ".contact-dialog__bar", ".contact-dialog__body", ".contact__grid", ".contact__label-row", ".contact__slots", ".contact__slot", ".contact__field"]) {
      const sizes = body(selector).split("\n").filter((l) => !/^\s*border/.test(l)).join("\n"); // a 1px hairline border is the one raw pixel value allowed
      expect(sizes, selector).not.toMatch(/\d+px/);
    }
  });
});

describe("the compact form", () => {
  it("the message textarea shows 3 rows, is resizable vertically and keeps the 1000 characters", () => {
    expect(form).toMatch(/<textarea rows=\{3\} maxLength=\{LIMITS\.message\}/);
    expect(body(".contact__field textarea")).toMatch(/resize: vertical/);
  });

  it("the two intro lines are one paragraph", () => {
    expect(form).toContain('{ui("contact.reassurance", lang)} {ui("contact.requiredNote", lang)}');
    expect(section).not.toContain("contact__lead");
    expect(css).not.toContain(".contact__lead");
  });

  it("phone, channel and best time share a row of three columns where they fit; name and e-mail share two", () => {
    expect(form.match(/contact__field contact__field--third/g)).toHaveLength(3);
    expect(body(".contact__grid")).toMatch(/gap: var\(--space-3\)/);
    expect(css).toMatch(/\.contact__grid \{\s*grid-template-columns: repeat\(6, 1fr\)/);
    expect(body(".contact__grid > .contact__field--third")).toMatch(/grid-column: span 2/);
    expect(body(".contact__grid > .contact__field--third")).toMatch(/justify-content: flex-end/); // inputs of the row stay in line when a label wraps
    expect(body(".contact__grid > .contact__field")).toMatch(/grid-column: span 3/);
    expect(body(".contact__grid > .contact__field--wide")).toMatch(/grid-column: 1 \/ -1/);
  });

  it("the character counter is in the same row as the message label", () => {
    expect(form).toMatch(/<div className="contact__label-row">\s*\{label\("message"[^}]*\)\}\s*<span className="contact__count"/);
    expect(body(".contact__label-row")).toMatch(/display: flex/);
    expect(body(".contact__label-row")).toMatch(/justify-content: space-between/);
  });

  it("keeps every field, the consent text and the submit button", () => {
    for (const name of ['name="requestType"', 'autoComplete="name"', 'type="email"', 'type="tel"', 'name="channel"', "contact.bestTime", "contact.message", 'name="consent"', 'name="website"', 'type="submit"']) expect(form, name).toContain(name);
    expect(form).toContain("{consentText}");
  });
});
