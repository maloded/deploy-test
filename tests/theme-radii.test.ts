// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { declaredVars, listThemes, OPTIONAL_VARS } from "@/lib/themes";

const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** `selector { body }` blocks (no nesting is used for these), including those inside @media. */
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
const using = (variable: string) => rules.filter((r) => r.body.includes(variable));

describe("--radius-dialog and --radius-control", () => {
  it("are optional theme variables, set in both themes (0.75rem and 0.375rem)", () => {
    expect(OPTIONAL_VARS).toContain("--radius-dialog");
    expect(OPTIONAL_VARS).toContain("--radius-control");
    for (const theme of listThemes()) {
      const text = fs.readFileSync(path.join(process.cwd(), "public", "themes", `${theme}.css`), "utf8");
      expect(declaredVars(text, theme), theme).toEqual(expect.arrayContaining(["--radius-dialog", "--radius-control"]));
      expect(text, theme).toMatch(/--radius-dialog:\s*0\.75rem/);
      expect(text, theme).toMatch(/--radius-control:\s*0\.375rem/);
      expect(text, theme).toMatch(/--radius:\s*(0|2px);/); // --radius itself is unchanged
    }
  });

  it("are always used with the fallback var(--radius)", () => {
    for (const name of ["--radius-dialog", "--radius-control"]) {
      const uses = css.match(new RegExp(`var\\(${name}[^)]*\\)+`, "g")) ?? [];
      expect(uses.length, name).toBeGreaterThan(0);
      for (const use of uses) expect(use, name).toBe(`var(${name}, var(--radius))`);
    }
  });

  it("the dialog box uses --radius-dialog and only it", () => {
    expect(using("--radius-dialog").map((r) => r.selector)).toEqual([".contact-dialog"]);
    expect(using("--radius-dialog")[0].body).toMatch(/border-radius: var\(--radius-dialog, var\(--radius\)\)/);
    expect(using("--radius-dialog")[0].body).toMatch(/overflow: hidden/); // clips the content to the rounded box
  });

  it("the form controls use --radius-control: the inputs, selects and the textarea (slot date and time fields included), nothing else", () => {
    const rule = using("--radius-control");
    expect(rule.map((r) => r.selector)).toEqual([".contact__field input, .contact__field select, .contact__field textarea"]);
    expect(rule[0].body).toMatch(/border-radius: var\(--radius-control, var\(--radius\)\)/);
  });

  it("no button rule uses them, and every button keeps the shared style (var(--radius))", () => {
    for (const r of [...using("--radius-dialog"), ...using("--radius-control")]) {
      expect(r.selector, r.selector).not.toMatch(/button|\.button|\[type="?submit|__close|__remove|__add|__open/);
    }
    for (const selector of [".button", ".contact-dialog__close", ".contact__slot-remove"]) {
      const body = rules.filter((r) => r.selector === selector).map((r) => r.body).join(" ");
      expect(body, selector).toMatch(/border-radius: var\(--radius\)/);
    }
    expect(css).not.toMatch(/button[^{}]*\{[^}]*--radius-(dialog|control)/);
  });

  it("the backdrop and the footer or hero rules are untouched by them", () => {
    expect(rules.find((r) => r.selector === ".contact-dialog::backdrop")!.body).not.toMatch(/radius/);
    const others = rules.filter((r) => !/contact/.test(r.selector));
    for (const r of others) expect(r.body, r.selector).not.toMatch(/--radius-(dialog|control)/);
  });
});
