// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import type { ContactElement } from "@/components/ContactSection";
import { buildSite } from "@/lib/site";
import { ui, uiFmt } from "@/lib/ui-strings";
import { FIXTURE_DIR, fixtures } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const site = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang);
let root: Root | undefined;
let box: HTMLDivElement | undefined;

function mount(lang: "de" | "en" = "en") {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={site(lang)} />));
}
beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

const section = () => box!.querySelector("#contact") as ContactElement;
const dialog = () => box!.querySelector("dialog.contact-dialog") as HTMLDialogElement;
const forms = () => [...box!.querySelectorAll("form.contact__form")] as HTMLFormElement[];
/** The one form of the page: it exists only inside the dialog. */
const inline = () => dialog().querySelector("form.contact__form") as HTMLFormElement;
const field = (form: HTMLElement, name: string) => form.querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const check = (el: HTMLInputElement) => act(() => void el.click());
const submit = async (form: HTMLFormElement) => act(async () => void form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const fill = (form: HTMLFormElement) => {
  type(field(form, "name"), "Test Person");
  type(field(form, "email"), "person@example.invalid");
  check(field(form, "consent"));
};
const reply = (status: number, body: unknown = { ok: status === 200 }) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })));

describe("the contact block (the footer's contact row)", () => {
  it("is the #contact target inside the footer: the e-mail link, no button of its own, no standalone section and no form field", () => {
    for (const lang of ["de", "en"] as const) {
      const s = site(lang);
      const out = renderToStaticMarkup(<ProductLayout site={s} />);
      expect(out.match(/id="contact"/g)).toHaveLength(1);
      expect(out).toMatch(/<footer[^>]*>[\s\S]*<div class="site-footer__contact" id="contact" data-block="contact">[\s\S]*<\/footer>/);
      expect(out).not.toMatch(/<section[^>]*(id="contact"|data-block="contact")/);
      expect(out).toContain(`href="mailto:${s.seller.contact.email}"`);
      expect(out).toContain('data-block-order="hero gallery specs offer faq contact"');
      expect(out).not.toContain("contact__open");
      for (const tag of ["<form", "<input", "<select", "<textarea"]) expect(out, tag).not.toContain(tag);
      expect(out).not.toContain(s.seller.consentText[lang]!);
    }
  });

  it("shows the seller's phone as a tel: link in the same row, when there is one", () => {
    const s = site("en");
    const out = renderToStaticMarkup(<ProductLayout site={{ ...s, seller: { ...s.seller, contact: { ...s.seller.contact, phone: "+43 1 000 00 00" } } }} />);
    expect(out).toContain('href="tel:+4310000000"');
    expect(out).toContain("+43 1 000 00 00");
    expect(renderToStaticMarkup(<ProductLayout site={s} />)).not.toContain("tel:");
  });

  it("the static markup has no standalone contact section, and every call-to-action targets #contact", () => {
    for (const lang of ["de", "en"] as const) {
      const out = renderToStaticMarkup(<ProductLayout site={site(lang)} />);
      expect(out).not.toMatch(/<section[^>]*contact/);
      expect(out).not.toMatch(/class="[^"]*contact__(open|actions|inner)/);
      // the buttons of the page: links with the shared button class; the only one that is not for the contact is "View specifications"
      const ctas = [...out.matchAll(/<a class="button[^"]*" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], text: m[2] }));
      expect(ctas.filter((c) => c.href !== "#specs").map((c) => c.href)).toEqual(["#contact", "#contact", "#contact"]); // header, hero, offer: one per place
      expect(ctas.filter((c) => c.href === "#specs")).toHaveLength(1);
      expect(out).not.toMatch(/<button[^>]*class="button/); // nothing else renders a call-to-action button
    }
  });

  it("the contact row scrolls into view with room above it (below any sticky header)", async () => {
    const css = (await import("node:fs")).readFileSync("src/app/globals.css", "utf8");
    expect(/\.site-footer__contact \{[^}]*scroll-margin-top: var\(--space-\d\)/.test(css)).toBe(true);
  });

  it("is one row: the e-mail is not repeated in a second footer line", () => {
    const out = renderToStaticMarkup(<ProductLayout site={site("en")} />);
    expect(out.match(/mailto:/g)).toHaveLength(1);
    expect(out.match(/site-footer__row/g)).toHaveLength(1);
  });

  it("links privacy and imprint only when the seller has set them (never a dead #anchor)", () => {
    const s = site("en");
    const without = renderToStaticMarkup(<ProductLayout site={s} />);
    expect(without).not.toMatch(/href="#privacy"|href="#imprint"/);
    expect(without).not.toMatch(/>Privacy<|>Imprint</);
    const withBoth = renderToStaticMarkup(<ProductLayout site={{ ...s, seller: { ...s.seller, privacyUrl: "https://example.invalid/privacy", imprintUrl: "https://example.invalid/imprint" } }} />);
    expect(withBoth).toContain('<a href="https://example.invalid/privacy">Privacy</a>');
    expect(withBoth).toContain('<a href="https://example.invalid/imprint">Imprint</a>');
    const anchors = new Set(without.match(/href="#[a-z]+"/g));
    expect([...anchors].sort()).toEqual(['href="#contact"', 'href="#specs"']); // header, hero and offer buttons, and the hero's specs link
  });

  it("uses the seller's privacyUrl in the dialog when there is one", () => {
    const s = site("en");
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root!.render(<ProductLayout site={{ ...s, seller: { ...s.seller, privacyUrl: "https://example.invalid/privacy" } }} />));
    expect(inline().querySelector('a[href="https://example.invalid/privacy"]')).toBeTruthy();
  });

  it("has the fields, with labels, required marks, limits and a hidden honeypot", () => {
    mount("en");
    const form = inline();
    for (const name of ["name", "email", "phone", "channel", "bestTime", "message", "consent", "website"]) expect(field(form, name), name).toBeTruthy();
    expect([...form.querySelectorAll("[required]")].map((e) => e.getAttribute("name"))).toEqual(["name", "email", "consent"]);
    expect(field(form, "message").getAttribute("maxlength")).toBe("1000");
    expect([...field(form, "channel").querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["", "email", "phone", "whatsapp", "telegram"]);
    for (const el of form.querySelectorAll("input:not([type=checkbox]), select, textarea")) {
      const id = el.getAttribute("id")!;
      expect(form.querySelector(`label[for="${id}"]`), id).toBeTruthy();
    }
    const hp = form.querySelector(".contact__hp")!;
    expect(hp.getAttribute("aria-hidden")).toBe("true");
    expect(field(form, "website").getAttribute("tabindex")).toBe("-1");
  });

  it("starts with the request type select, default question, listing what the product accepts (no viewing settings: no viewing, no test drive)", () => {
    mount("en");
    const first = inline().querySelector(".contact__field")!;
    expect(first.querySelector("select")!.getAttribute("name")).toBe("requestType");
    const select = field(inline(), "requestType") as unknown as HTMLSelectElement;
    expect(select.value).toBe("question");
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([["question", "Question"], ["offer", "Make an offer"]]);
    expect(select.hasAttribute("required") || inline().querySelector("label[for]")!.textContent!.includes("*")).toBe(true);
  });

  it("labels the types in the page language, and sends the chosen one with the lead", async () => {
    mount("de");
    expect([...(field(inline(), "requestType") as unknown as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Frage", "Angebot machen"]);
    const f = reply(200);
    fill(inline());
    type(field(inline(), "requestType") as unknown as HTMLSelectElement, "offer");
    await submit(inline());
    expect(JSON.parse((f.mock.calls as any)[0][1].body)).toMatchObject({ requestType: "offer", lang: "de" });
  });

  it("never repeats an id on the page (the band, the dialog and the form)", () => {
    mount("de");
    const ids = [...box!.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(12);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe("validation and the error summary", () => {
  it("an empty submit shows inline errors in the page language and moves focus to the summary", async () => {
    for (const lang of ["en", "de"] as const) {
      mount(lang);
      const f = reply(200);
      await submit(inline());
      expect(f).not.toHaveBeenCalled();
      const summary = inline().querySelector(".contact__summary") as HTMLElement;
      expect(summary.getAttribute("role")).toBe("alert");
      expect(document.activeElement).toBe(summary);
      expect(summary.textContent).toContain(ui("contact.error.summary", lang));
      expect(inline().querySelector(`#${CSS.escape(field(inline(), "name").getAttribute("aria-describedby")!)}`)!.textContent).toBe(ui("contact.error.required", lang));
      expect(field(inline(), "name").getAttribute("aria-invalid")).toBe("true");
      expect(field(inline(), "consent").getAttribute("aria-invalid")).toBe("true");
      expect(inline().querySelector(`#${CSS.escape(field(inline(), "consent").getAttribute("aria-describedby")!)}`)!.textContent).toBe(ui("contact.error.consent", lang));
      act(() => root!.unmount());
      box!.remove();
      root = box = undefined;
    }
  });

  it("a bad e-mail and a bad phone number get their own messages; the summary links focus the field", async () => {
    mount("en");
    fill(inline());
    type(field(inline(), "email"), "not-an-email");
    type(field(inline(), "phone"), "abc");
    await submit(inline());
    const text = inline().querySelector(".contact__summary")!.textContent!;
    expect(text).toContain(ui("contact.error.email", "en"));
    expect(text).toContain(ui("contact.error.phone", "en"));
    const link = [...inline().querySelectorAll(".contact__summary a")].find((a) => a.textContent === ui("contact.email", "en")) as HTMLElement;
    act(() => void link.click());
    expect(document.activeElement).toBe(field(inline(), "email"));
  });

  it("editing a field clears its error", async () => {
    mount("en");
    await submit(inline());
    expect(field(inline(), "name").getAttribute("aria-invalid")).toBe("true");
    type(field(inline(), "name"), "A");
    expect(field(inline(), "name").getAttribute("aria-invalid")).toBeNull();
  });

  it("a message over 1000 characters is refused with the limit named", async () => {
    mount("en");
    fill(inline());
    const area = field(inline(), "message") as unknown as HTMLTextAreaElement;
    type(area, "x".repeat(1001)); // maxlength stops a person, not a script
    await submit(inline());
    expect(inline().querySelector(".contact__summary")!.textContent).toContain("at most 1000 characters");
  });
});

describe("sending", () => {
  it("posts JSON with the same-origin header, then shows the success text, clears the form and emits contact-submitted without data", async () => {
    mount("en");
    const f = reply(200);
    const events: CustomEvent[] = [];
    document.addEventListener("contact-submitted", (e) => events.push(e as CustomEvent), { once: true });
    fill(inline());
    type(field(inline(), "message"), "Hello");
    await submit(inline());
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = (f.mock.calls as any)[0];
    expect(url).toBe("/api/lead");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", "x-lead-request": "1" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ name: "Test Person", email: "person@example.invalid", message: "Hello", consent: true, lang: "en", website: "" });
    expect(body.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(body).not.toHaveProperty("source");
    expect(section().textContent).not.toContain("Test Person");
    expect(section().querySelector(".contact__success")!.textContent).toContain(ui("contact.success.text", "en"));
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({});
    expect(JSON.stringify(events[0].detail)).not.toContain("person@");
  });

  it("success text in German", async () => {
    mount("de");
    reply(200);
    fill(inline());
    await submit(inline());
    expect(section().textContent).toContain(ui("contact.success.text", "de"));
  });

  it.each([
    ["no answer at all", null, "unavailable"],
    ["a 503", 503, "unavailable"],
    ["a 404", 404, "unavailable"],
    ["a 200 that is not ok:true", "odd", "unavailable"],
    ["a 422 (too fast)", 422, "tooFast"],
    ["a 429 (rate limit)", 429, "rate"],
    ["a 400 without field details", 400, "invalid"],
  ] as const)("%s never claims success and shows the honest message", async (_label, status, kind) => {
    mount("en");
    if (status === null) vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    else if (status === "odd") reply(200, { ok: "yes" });
    else reply(status, { ok: false });
    const submitted = vi.fn();
    document.addEventListener("contact-submitted", submitted);
    fill(inline());
    await submit(inline());
    document.removeEventListener("contact-submitted", submitted);
    expect(submitted).not.toHaveBeenCalled();
    expect(section().querySelector(".contact__success")).toBeNull();
    const summary = inline().querySelector(".contact__summary") as HTMLElement;
    // the "unavailable" text now carries the seller's address in place of {email}
    expect(summary.textContent).toContain(uiFmt(`contact.error.${kind}` as any, "en", { email: site("en").seller.contact.email }));
    expect(document.activeElement).toBe(summary);
    const mail = summary.querySelector("a");
    if (kind === "unavailable" || kind === "rate") expect(mail?.getAttribute("href")).toBe(`mailto:${site("en").seller.contact.email}`);
    expect(field(inline(), "name").value).toBe("Test Person"); // nothing the visitor typed is lost
  });

  it.each([
    ["en", "Please check the form and send it again."],
    ["de", "Bitte prüfen Sie das Formular und senden Sie es erneut."],
  ] as const)("a too-fast 422 and a validation 400 show the generic check-the-form text in %s, without a mailto link", async (lang, text) => {
    for (const status of [422, 400]) {
      mount(lang);
      reply(status, { ok: false });
      fill(inline());
      await submit(inline());
      const summary = inline().querySelector(".contact__summary") as HTMLElement;
      expect(summary.textContent).toBe(text);
      expect(summary.querySelector("a")).toBeNull();
      act(() => root!.unmount());
      box!.remove();
    }
  });

  it.each([
    ["en", "Your request could not be sent and was not saved. Please write to us by e-mail: "],
    ["de", "Ihre Anfrage konnte nicht gesendet werden und wurde nicht gespeichert. Bitte schreiben Sie uns per E-Mail: "],
  ] as const)("a 503 and a network failure show the could-not-be-sent text in %s with the seller's address as a mailto link inside it", async (lang, text) => {
    const mail = site(lang).seller.contact.email;
    for (const failure of [503, null] as const) {
      mount(lang);
      if (failure === null) vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
      else reply(failure, { ok: false });
      fill(inline());
      await submit(inline());
      const summary = inline().querySelector(".contact__summary") as HTMLElement;
      expect(summary.textContent).toBe(text + mail);
      expect(summary.querySelectorAll("a")).toHaveLength(1);
      expect(summary.querySelector("a")!.getAttribute("href")).toBe(`mailto:${mail}`);
      act(() => root!.unmount());
      box!.remove();
    }
  });

  it("a seller without an address gets the could-not-be-sent text without a link", async () => {
    const bare = site("en");
    bare.seller.contact.email = "";
    box = document.createElement("div");
    document.body.appendChild(box);
    root = createRoot(box);
    act(() => root!.render(<ProductLayout site={bare} />));
    reply(503, { ok: false });
    fill(inline());
    await submit(inline());
    const summary = inline().querySelector(".contact__summary") as HTMLElement;
    expect(summary.textContent).toBe(ui("contact.error.unavailableNoMail", "en"));
    expect(summary.querySelector("a")).toBeNull();
  });

  it("shows field errors that the server names (400 with errors)", async () => {
    mount("de");
    reply(400, { ok: false, errors: { email: "email" } });
    fill(inline());
    await submit(inline());
    expect(inline().querySelector(".contact__summary")!.textContent).toContain(ui("contact.error.email", "de"));
  });
});

describe("the dialog", () => {
  const opener = () => box!.querySelector('header a[href="#contact"]') as HTMLAnchorElement;

  it("opens from the header, hero and offer buttons, and the inline section stays", () => {
    mount("en");
    const links = [...box!.querySelectorAll('a[href="#contact"]')].filter((a) => !section().contains(a));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      act(() => void link.dispatchEvent(click));
      expect(click.defaultPrevented).toBe(true);
      expect(dialog().open).toBe(true);
      key(dialog(), "Escape");
      expect(dialog().open).toBe(false);
    }
  });

  it("leaves modified clicks, middle clicks and links inside the section alone", () => {
    mount("en");
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
      act(() => void opener().dispatchEvent(click));
      expect(click.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
    expect(dialog().open).toBe(false);
  });

  it("moves focus into the dialog, traps Tab, closes on Escape and returns focus to the opener", () => {
    mount("en");
    const btn = opener();
    btn.focus();
    act(() => void btn.click());
    expect(dialog().open).toBe(true);
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(field(dialog(), "name")); // focus goes to the Name input
    expect(document.body.style.overflow).toBe("hidden");

    const items = [...dialog().querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]):not([tabindex='-1']), select, textarea")];
    items[items.length - 1].focus();
    key(dialog(), "Tab");
    expect(document.activeElement).toBe(items[0]);
    key(dialog(), "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(items[items.length - 1]);

    key(dialog(), "Escape");
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(btn);
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with its close button and has an accessible name", () => {
    mount("de");
    act(() => void opener().click());
    expect(dialog().getAttribute("aria-labelledby")).toBe(dialog().querySelector("h2")!.id);
    act(() => void (dialog().querySelector(".contact-dialog__close") as HTMLElement).click());
    expect(dialog().open).toBe(false);
  });

  it("keeps what was typed when the dialog is closed and opened again", () => {
    mount("en");
    act(() => void opener().click());
    type(field(inline(), "name"), "Typed once");
    check(field(inline(), "consent"));
    key(dialog(), "Escape");
    act(() => void opener().click());
    expect(field(inline(), "name").value).toBe("Typed once");
    expect(field(inline(), "consent").checked).toBe(true);
    expect(forms()).toHaveLength(1);
  });

  it("submitting in the dialog shows the success panel there, and its button closes the dialog", async () => {
    mount("en");
    reply(200);
    act(() => void opener().click());
    fill(dialog().querySelector("form") as HTMLFormElement);
    await submit(dialog().querySelector("form") as HTMLFormElement);
    const done = dialog().querySelector(".contact__success button") as HTMLButtonElement;
    expect(document.activeElement).toBe(done);
    act(() => void done.click());
    expect(dialog().open).toBe(false);
  });

  it("an error in the dialog puts focus on the dialog's summary", async () => {
    mount("en");
    act(() => void opener().click());
    await submit(dialog().querySelector("form") as HTMLFormElement);
    expect(document.activeElement).toBe(dialog().querySelector(".contact__summary"));
  });
});

describe("the page interface on section#contact", () => {
  it("exposes exactly open and close: no way to read or write a field, and no consent", () => {
    mount("en");
    const el = section() as any;
    const own = Object.keys(el).filter((k) => typeof el[k] === "function").sort();
    expect(own).toEqual(["close", "open"]);
    for (const name of ["setField", "getState", "prefill", "setConsent", "consent", "values", "submit"]) expect(el[name], name).toBeUndefined();
    expect(el.open.length).toBe(0); // no parameter: nothing can be passed in
    expect(el.close.length).toBe(0);
  });

  it("open() and close() drive the dialog and emit bubbling events without data", () => {
    mount("en");
    const seen: [string, unknown][] = [];
    for (const name of ["contact-open", "contact-close"]) document.addEventListener(name, (e) => seen.push([e.type, (e as CustomEvent).detail]));
    type(field(inline(), "name"), "Secret Name");
    section().open();
    expect(dialog().open).toBe(true);
    section().open(); // already open: no second event
    section().close();
    expect(dialog().open).toBe(false);
    expect(seen).toEqual([["contact-open", {}], ["contact-close", {}]]);
    expect(JSON.stringify(seen)).not.toContain("Secret");
  });

  it("the page root carries no typed value (nothing in attributes or data-*)", () => {
    mount("en");
    type(field(inline(), "name"), "Hidden Value");
    const attrs = [...section().attributes].map((a) => `${a.name}=${a.value}`).join(" ");
    expect(attrs).not.toContain("Hidden Value");
    expect(Object.keys((section() as any).dataset)).toEqual(["block"]);
  });
});
