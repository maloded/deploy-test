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
const slotRows = () => [...form().querySelectorAll(".contact__slot")] as HTMLElement[];
const dateInput = (i: number) => slotRows()[i].querySelector("input[type=date]") as HTMLInputElement;
const timeSelect = (i: number) => slotRows()[i].querySelector("select") as HTMLSelectElement;
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
  click(field("consent"));
};
const chooseViewing = () => type(field("requestType"), "viewing");
const sent = (f: ReturnType<typeof reply>) => JSON.parse((f.mock.calls as any)[0][1].body);

describe("request types in the form", () => {
  it("with viewing settings (the house): viewing, question and offer, default question, and no slot fields yet", () => {
    mount(house("en"));
    const select = field("requestType") as unknown as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["viewing", "question", "offer"]);
    expect(select.value).toBe("question");
    expect(form().querySelector(".contact__slots")).toBeNull();
  });

  it("without viewing settings (the car fixture): no viewing, no test drive, and never any slot field", () => {
    mount(car("en"));
    expect([...(field("requestType") as unknown as HTMLSelectElement).options].map((o) => o.value)).toEqual(["question", "offer"]);
    for (const t of ["question", "offer"]) {
      type(field("requestType"), t);
      expect(form().querySelector(".contact__slots, input[type=date]")).toBeNull();
    }
  });

  it("labels the types in German", () => {
    mount(house("de"));
    expect([...(field("requestType") as unknown as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Besichtigung", "Frage", "Angebot machen"]);
  });
});

describe("the slots", () => {
  it("appear for a viewing: the address and notes read only, then one row with a date and a time", () => {
    mount(house("en"));
    chooseViewing();
    const box = form().querySelector(".contact__slots")!;
    expect(box.querySelector("legend")!.textContent).toContain("Preferred times");
    const info = box.querySelector(".contact__viewing")!;
    expect(info.textContent).toContain("Example Street 1");
    expect(info.textContent).toContain("example.invalid");
    expect(info.textContent).toContain("Please bring a photo ID. (fake example)");
    expect(info.querySelector("input, select, textarea")).toBeNull(); // read only
    expect(slotRows()).toHaveLength(1);
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

  it("limit the date to tomorrow..60 days in the SELLER's calendar and offer the times of the day", () => {
    mount(house("en"));
    chooseViewing();
    expect(dateInput(0).min).toBe("2026-06-11");
    expect(dateInput(0).max).toBe("2026-08-09");
    expect([...timeSelect(0).options].map((o) => o.value)).toEqual(["", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
  });

  it("follow the seller's midnight, not the visitor's clock", () => {
    vi.setSystemTime(new Date("2026-06-10T22:01:00Z")); // already the 11th in Vienna
    mount(house("en"));
    chooseViewing();
    expect(dateInput(0).min).toBe("2026-06-12");
    expect(dateInput(0).max).toBe("2026-08-10");
  });

  it("can grow to three rows and shrink again; the add button goes away at three", () => {
    mount(house("en"));
    chooseViewing();
    const add = () => form().querySelector(".contact__slot-add");
    click(add()!);
    click(add()!);
    expect(slotRows()).toHaveLength(3);
    expect(add()).toBeNull();
    click(form().querySelector(".contact__slot-remove")!);
    expect(slotRows()).toHaveLength(2);
    expect(add()).toBeTruthy();
  });

  it("disappear again when another type is chosen, and are not sent", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    type(dateInput(0), "2026-06-11");
    type(timeSelect(0), "10:00");
    type(field("requestType"), "offer");
    expect(form().querySelector(".contact__slots")).toBeNull();
    fillPerson();
    await submit();
    expect(sent(f)).not.toHaveProperty("preferredSlots");
    expect(sent(f).requestType).toBe("offer");
  });

  it("give every control a label and no repeated id", () => {
    mount(house("en"));
    chooseViewing();
    click(form().querySelector(".contact__slot-add")!);
    for (const el of form().querySelectorAll(".contact__slots input, .contact__slots select")) {
      expect(form().querySelector(`label[for="${el.id}"]`), el.id).toBeTruthy();
    }
    const ids = [...box!.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe("sending a viewing request", () => {
  it("posts the type and the seller-local slots, then says the request will be confirmed, never that it is booked", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    type(dateInput(0), "2026-06-11");
    type(timeSelect(0), "10:00");
    click(form().querySelector(".contact__slot-add")!);
    type(dateInput(1), "2026-06-13");
    type(timeSelect(1), "15:00");
    fillPerson();
    await submit();
    expect(sent(f)).toMatchObject({ requestType: "viewing", preferredSlots: [{ date: "2026-06-11", time: "10:00" }, { date: "2026-06-13", time: "15:00" }] });
    const text = box!.querySelector(".contact__success")!.textContent!;
    expect(text).toContain("We will confirm a time by e-mail or phone");
    expect(text).not.toMatch(/booked|gebucht/i);
  });

  it("ignores a blank row, and says the same in German", async () => {
    const f = reply(200);
    mount(house("de"));
    chooseViewing();
    type(dateInput(0), "2026-06-11");
    type(timeSelect(0), "12:00");
    click(form().querySelector(".contact__slot-add")!); // stays blank
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

  it("needs at least one slot: the summary says so and nothing is sent", async () => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    fillPerson();
    await submit();
    expect(f).not.toHaveBeenCalled();
    expect(form().querySelector(".contact__summary")!.textContent).toContain("Please give at least one preferred time.");
    click(form().querySelector(".contact__summary a[href]")!); // the first slot's date
    expect(document.activeElement).toBe(dateInput(0));
  });

  it.each([
    ["a half-filled row", "2026-06-11", "", "Please choose a date and a time."],
    ["a day that is not allowed", "2026-06-12", "10:00", "This day is not available. Available days: Tuesday, Thursday, Saturday."],
    ["today", "2026-06-10", "10:00", "Please choose a day from tomorrow on."],
    ["a day beyond the horizon", "2026-08-11", "10:00", "Please choose a day within the next 60 days."],
  ])("shows the problem of the row for %s and sends nothing", async (_label, date, time, message) => {
    const f = reply(200);
    mount(house("en"));
    chooseViewing();
    type(dateInput(0), date);
    if (time) type(timeSelect(0), time);
    fillPerson();
    await submit();
    expect(f).not.toHaveBeenCalled();
    const error = slotRows()[0].querySelector(".contact__error")!;
    expect(error.textContent).toBe(message);
    expect(dateInput(0).getAttribute("aria-describedby")).toBe(error.id);
    expect(dateInput(0).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(form().querySelector(".contact__summary"));
  });

  it("refuses the same time twice", async () => {
    reply(200);
    mount(house("en"));
    chooseViewing();
    click(form().querySelector(".contact__slot-add")!);
    for (const i of [0, 1]) {
      type(dateInput(i), "2026-06-11");
      type(timeSelect(i), "10:00");
    }
    fillPerson();
    await submit();
    expect(slotRows()[1].querySelector(".contact__error")!.textContent).toBe("Please choose a different time for each entry.");
  });

  it("shows the server's refusal of the slots without claiming success", async () => {
    reply(400, { ok: false, error: "invalid", errors: { preferredSlots: "invalid" } });
    mount(house("en"));
    chooseViewing();
    type(dateInput(0), "2026-06-11");
    type(timeSelect(0), "10:00");
    fillPerson();
    await submit();
    expect(box!.querySelector(".contact__success")).toBeNull();
    expect(form().querySelector(".contact__summary")!.textContent).toContain("Please check the preferred times.");
  });

  it("keeps the slots typed after an error (a 503) and never reports a booking", async () => {
    reply(503, { ok: false });
    mount(house("en"));
    chooseViewing();
    type(dateInput(0), "2026-06-11");
    type(timeSelect(0), "10:00");
    fillPerson();
    await submit();
    expect(dateInput(0).value).toBe("2026-06-11");
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
    expect(out).not.toMatch(/type="date"|contact__slot/);
  });
});
