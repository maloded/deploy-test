// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductLayout from "@/components/ProductLayout";
import { UI_KEYS, ui, uiEntry } from "@/lib/ui-strings";
import { buildSite } from "@/lib/site";
import { examples, FIXTURE_DIR, fixtures } from "./helpers";
import { chooseType, dayButton, pickedSlots, pickSlot, selectedType, tabTypes, timeButton } from "./form-ui";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const house = (lang: "de" | "en") => buildSite(null, examples.ref("example-house"), examples.root, lang);
const car = (lang: "de" | "en") => buildSite(null, `${fixtures.seller}/fixture-car`, FIXTURE_DIR, lang); // no viewing settings
let root: Root | undefined;
let box: HTMLDivElement | undefined;

function mount(site: ReturnType<typeof house>) {
  box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  act(() => root!.render(<ProductLayout site={site} />));
}
// Wednesday 10 June 2026, 12:00 in Vienna (the house example's time zone). Only Date is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  box?.remove();
  root = box = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const form = () => box!.querySelector("dialog form.contact__form") as HTMLFormElement;
const field = (name: string) => form().querySelector(`[name=${name}]`) as HTMLInputElement;
function type(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const click = (el: Element) => act(() => void (el as HTMLElement).click());
const submit = async () => act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const reply = (status: number, body: unknown = { ok: status === 200 }) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const fillPerson = () => {
  type(field("name"), "Test Person");
  type(field("email"), "person@example.invalid");
  type(field("message"), "A question about the house"); // a question needs it on the web
  click(field("consent"));
};
const chooseViewing = () => chooseType(box!, "viewing");
const sent = (f: ReturnType<typeof reply>) => JSON.parse((f.mock.calls as any)[0][1].body);

describe("request types in the form", () => {
  it("with viewing settings (the house): tabs for viewing, question and offer, the question chosen, and no slot fields yet", () => {
    mount(house("en"));
    expect(tabTypes(box!)).toEqual(["viewing", "question", "offer"]);
    expect(selectedType(box!)).toBe("question");
    expect(form().querySelector(".contact__slots")).toBeNull();
  });

  it("without viewing settings (the car fixture): no viewing, no test drive, and never any slot field", () => {
    mount(car("en"));
    expect(tabTypes(box!)).toEqual(["question", "offer"]);
    for (const t of ["question", "offer"]) {
      chooseType(box!, t);
      expect(form().querySelector(".contact__slots, .contact__days")).toBeNull();
    }
  });

  it("labels the types in German", () => {
    mount(house("de"));
    expect([...box!.querySelectorAll("dialog [role=tab]")].map((t) => t.textContent)).toEqual(["Besichtigung", "Frage", "Angebot machen"]);
  });
});

describe("the slots", () => {
  /** The days the strip shows, as YYYY-MM-DD. */
  const days = () => [...form().querySelectorAll<HTMLElement>(".contact__day")].map((d) => d.dataset.day);
  const times = () => [...form().querySelectorAll<HTMLElement>(".contact__time")].map((t) => t.dataset.time);

  it("appear for a viewing: the address and notes read only, three numbered places, the days and the times", () => {
    mount(house("en"));
    chooseViewing();
    const box = form().querySelector(".contact__slots")!;
    expect(box.querySelector("legend")!.textContent).toContain("Preferred times");
    const info = box.querySelector(".contact__viewing")!;
    expect(info.textContent).toContain("Example Street 1");
    expect(info.textContent).toContain("example.invalid");
    expect(info.textContent).toContain("Please bring a photo ID. (fake example)");
    expect(info.querySelector("input, select, textarea, button")).toBeNull(); // read only
    expect(box.querySelectorAll(".contact__pick")).toHaveLength(3);
    expect(box.querySelectorAll(".contact__pick.is-empty")).toHaveLength(3);
    expect(box.textContent).toContain("Available: Tuesday, Thursday, Saturday, 10:00 to 16:00.");
    expect(box.textContent).toContain("Europe/Vienna");
  });

  it("show the address and notes in German", () => {
    mount(house("de"));
    chooseViewing();
    const info = form().querySelector(".contact__viewing")!;
    expect(info.textContent).toContain("Beispielstraße 1");
    expect(info.textContent).toContain("Bitte bringen Sie einen Lichtbildausweis mit");
    expect(form().querySelector(".contact__slots")!.textContent).toContain("Möglich: Dienstag, Donnerstag, Samstag, 10:00 bis 16:00 Uhr.");
  });

  it("offer a short strip of the days with visits from tomorrow on, in the SELLER's calendar, and the times of the day", () => {
    mount(house("en"));
    chooseViewing();
    expect(days()).toHaveLength(14);
    expect(days()[0]).toBe("2026-06-11"); // tomorrow, a Thursday
    expect(days().slice(0, 4)).toEqual(["2026-06-11", "2026-06-13", "2026-06-16", "2026-06-18"]); // Thu, Sat, Tue, Thu: only the days with visits
    for (const d of days()) expect(["Tue", "Thu", "Sat"]).toContain(new Date(`${d}T12:00:00Z`).toUTCString().slice(0, 3));
    expect(days().every((d) => d! <= "2026-08-09")).toBe(true); // the 60-day horizon
    expect(times()).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
  });

  it("follow the seller's midnight, not the visitor's clock", () => {
    vi.setSystemTime(new Date("2026-06-10T22:01:00Z")); // already the 11th in Vienna: tomorrow is the 12th, a Friday
    mount(house("en"));
    chooseViewing();
    expect(days()[0]).toBe("2026-06-13"); // the first day with visits after it
    expect(dayButton(box!, "2026-06-11")).toBeNull(); // today in Vienna: not offered
    expect(dayButton(box!, "2026-06-10")).toBeNull();
  });

  it("pick up to three times: the places fill in order of time, a time pressed again is taken away, the fourth is not offered", () => {
    mount(house("en"));
    chooseViewing();
    pickSlot(box!, "2026-06-13", "15:00");
    pickSlot(box!, "2026-06-11", "10:00");
    expect(pickedSlots(box!)).toEqual(["Thu 11/06 · 10:00", "Sat 13/06 · 15:00"]); // sorted by time
    expect(form().querySelector(".contact__pick.is-empty")).not.toBeNull();
    pickSlot(box!, "2026-06-16", "11:00");
    expect(pickedSlots(box!)).toHaveLength(3);
    expect(form().querySelector(".contact__pick.is-empty")).toBeNull();
    expect(timeButton(box!, "12:00")!.disabled).toBe(true); // full: the others cannot be added
    expect(timeButton(box!, "11:00")!.disabled).toBe(false); // the picked one on this day can be taken away
    click(timeButton(box!, "11:00")!);
    expect(pickedSlots(box!)).toHaveLength(2);
    expect(timeButton(box!, "12:00")!.disabled).toBe(false);
    click(form().querySelector(".contact__pick-remove")!);
    expect(pickedSlots(box!)).toHaveLength(1);
    expect(dayButton(box!, "2026-06-16")!.querySelector(".contact__dot")).toBeNull(); // the dot on a day marks a picked time
    expect(dayButton(box!, "2026-06-13")!.querySelector(".contact__dot")).not.toBeNull();
  });

  it("disappear again when another type is chosen, and are not sent", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    pickSlot(box!, "2026-06-11", "10:00");
    chooseType(box!, "offer");
    expect(form().querySelector(".contact__slots")).toBeNull();
    type(field("phone"), "+00 000 000 000"); // an offer needs phone and e-mail, and an amount inside the product's range
    type(field("amount"), "500,000"); // English: a comma separates the thousands
    fillPerson();
    await submit();
    expect(sent(f)).not.toHaveProperty("preferredSlots");
    expect(sent(f).requestType).toBe("offer");
  });

  it("give every control a label and no repeated id; the groups are named", () => {
    mount(house("en"));
    chooseViewing();
    for (const el of form().querySelectorAll("input, textarea")) if ((el as HTMLInputElement).type !== "hidden" && !el.closest(".contact__hp")) expect(form().querySelector(`label[for="${el.id}"]`), el.id || (el as HTMLInputElement).name).toBeTruthy();
    for (const group of form().querySelectorAll(".contact__days, .contact__times")) expect(group.getAttribute("aria-label")).toBeTruthy();
    const ids = [...box!.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe("sending a viewing request", () => {
  it("posts the type and the seller-local slots, then says the request will be confirmed, never that it is booked", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    pickSlot(box!, "2026-06-11", "10:00");
    pickSlot(box!, "2026-06-13", "15:00");
    fillPerson();
    await submit();
    expect(sent(f)).toMatchObject({ requestType: "viewing", preferredSlots: [{ date: "2026-06-11", time: "10:00" }, { date: "2026-06-13", time: "15:00" }] });
    const text = box!.querySelector(".contact__success")!.textContent!;
    expect(text).toContain("We will confirm a time by e-mail or phone");
    expect(text).not.toMatch(/booked|gebucht/i);
  });

  it("says the same in German", async () => {
    const f = reply(200);
    mount(house("de"));
    chooseViewing();
    pickSlot(box!, "2026-06-11", "12:00");
    fillPerson();
    await submit();
    expect(sent(f).preferredSlots).toEqual([{ date: "2026-06-11", time: "12:00" }]);
    expect(box!.querySelector(".contact__success")!.textContent).toContain("Wir bestätigen einen Termin per E-Mail oder telefonisch.");
  });

  it("a question gets the plain success text", async () => {
    reply(200);
    mount(house("en"));
    fillPerson();
    await submit();
    expect(box!.querySelector(".contact__success")!.textContent).toContain(ui("contact.success.text", "en"));
  });

  it("an offer gets the text that the owner will look at it personally", async () => {
    reply(200);
    mount(house("en"));
    chooseType(box!, "offer");
    type(field("phone"), "+00 000 000 000");
    type(field("amount"), "500,000"); // English: a comma separates the thousands
    fillPerson();
    await submit();
    expect(box!.querySelector(".contact__success")!.textContent).toContain(ui("contact.success.offer", "en"));
  });

  it("needs at least one slot: the summary says so, nothing is sent, and its link takes the focus to the first day", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    fillPerson();
    await submit();
    expect(f).not.toHaveBeenCalled();
    expect(form().querySelector(".contact__summary")!.textContent).toContain("Please give at least one preferred time.");
    click(form().querySelector(".contact__summary a[href]")!);
    expect(document.activeElement).toBe(form().querySelector(".contact__day"));
  });

  it("shows the server's refusal of the slots without claiming success", async () => {
    reply(400, { ok: false, error: "invalid", errors: { preferredSlots: "invalid" } });
    mount(house("en"));
    chooseViewing();
    pickSlot(box!, "2026-06-11", "10:00");
    fillPerson();
    await submit();
    expect(box!.querySelector(".contact__success")).toBeNull();
    expect(form().querySelector(".contact__summary")!.textContent).toContain("Please check the preferred times.");
  });

  it("keeps the slots picked after an error (a 503) and never reports a booking", async () => {
    reply(503, { ok: false });
    mount(house("en"));
    chooseViewing();
    pickSlot(box!, "2026-06-11", "10:00");
    fillPerson();
    await submit();
    expect(pickedSlots(box!)).toEqual(["Thu 11/06 · 10:00"]);
    expect(box!.querySelector(".contact__success")).toBeNull();
  });
});

describe("the strings", () => {
  it("say a time will be confirmed and never that it is booked (en and de)", () => {
    for (const key of UI_KEYS.filter((k) => k.startsWith("contact."))) {
      for (const text of Object.values(uiEntry(key))) expect(text, key).not.toMatch(/booked|gebucht|buchung|gebucht/i);
    }
  });

  it("has the viewing request type labels and slot strings in both languages", () => {
    for (const lang of ["de", "en"] as const) for (const key of UI_KEYS.filter((k) => k.startsWith("contact.slots.") || k.startsWith("contact.error.slot"))) expect(ui(key, lang), key).toBeTruthy();
  });

  it("the static page has no slot field (the form is not in the HTML at all)", () => {
    const out = renderToStaticMarkup(<ProductLayout site={house("en")} />);
    expect(out).not.toMatch(/type="date"|contact__day|contact__time/);
  });
});
