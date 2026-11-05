// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contactNavResets, FORM_PHASES, formContext, formPhase, hasValuesOf, MISSING_KEYS, missingKeysOf, SUBMIT_STATES, valuesOf } from "@/lib/form-context";
import { getFormSnapshot, resetFormSnapshotForTests, updateFormSnapshot } from "@/lib/form-snapshot";
import { navigationType } from "@/lib/request-types";

// The reference site's page-context.js cases (formPhase, formContext, contactNavResets), on this site's snapshot.

const snap = (patch: Parameters<typeof updateFormSnapshot>[0] = {}) => {
  resetFormSnapshotForTests();
  updateFormSnapshot({ everOpened: true, dialogOpen: true, formMissing: [], consentGiven: true, name: "Max Muster", email: "max@example.invalid", requestType: "question", message: "Hello", ...patch });
  return getFormSnapshot();
};

describe("formPhase (the reference's table)", () => {
  const miss = ["name", "phone_or_email", "consent"] as const;
  it("not_opened until the form was opened, whatever else there is", () => {
    expect(formPhase({ everOpened: false, visible: false, hasValues: false, missing: [...miss], sent: false })).toBe("not_opened");
    expect(formPhase({ everOpened: false, visible: true, hasValues: true, missing: ["name"], sent: false })).toBe("not_opened");
  });

  it("closed_empty / open_filling / incomplete / no_consent / complete", () => {
    const cases = [
      [true, false, [...miss], "open_filling"], // open and on screen, still empty
      [true, true, ["phone_or_email", "consent"], "open_filling"],
      [false, false, [...miss], "closed_empty"], // opened, nothing entered, left
      [false, true, ["phone_or_email", "consent"], "incomplete"], // entered some, left
      [false, true, ["phone_or_email"], "incomplete"], // missing more than the tick
      [true, true, ["consent"], "no_consent"], // all valid, only the tick: also on screen
      [false, true, ["consent"], "no_consent"], // and also off screen
      [true, true, [], "complete"],
      [false, true, [], "complete"],
    ] as const;
    for (const [visible, hasValues, missing, expected] of cases) expect(formPhase({ everOpened: true, visible, hasValues, missing: [...missing], sent: false }), `${visible} ${hasValues} ${missing}`).toBe(expected);
  });

  it("a sent request is complete, whatever is missing now", () => {
    expect(formPhase({ everOpened: true, visible: false, hasValues: false, missing: ["name", "consent"], sent: true })).toBe("complete");
  });

  it("the phases and states are the reference's", () => {
    expect([...FORM_PHASES]).toEqual(["not_opened", "open_filling", "closed_empty", "incomplete", "no_consent", "complete"]);
    expect([...SUBMIT_STATES]).toEqual(["none", "sending", "sent", "error"]);
    expect([...MISSING_KEYS]).toEqual(["slots", "amount", "message", "name", "phone_or_email", "email", "phone", "consent"]);
  });
});

describe("missingKeysOf: the blocking fields in the agent's words and the reference's fixed order", () => {
  it("phone_or_email replaces email and phone while neither is given; an offer names them one by one", () => {
    expect(missingKeysOf(new Set(["name", "email", "phone", "consent"]), { email: "phoneOrEmail", phone: "phoneOrEmail" })).toEqual(["name", "phone_or_email", "consent"]);
    expect(missingKeysOf(new Set(["name", "email", "phone", "consent"]), { email: "required", phone: "required" })).toEqual(["name", "email", "phone", "consent"]);
    expect(missingKeysOf(new Set(["email"]), { email: "email" })).toEqual(["email"]); // an invalid address is named by itself
    expect(missingKeysOf(new Set(["phone"]), { phone: "phone" })).toEqual(["phone"]);
  });

  it("slots, amount and message come first, in the reference's order, whatever the page order is", () => {
    expect(missingKeysOf(new Set(["consent", "message", "name", "preferredSlots", "amount"]), {})).toEqual(["slots", "amount", "message", "name", "consent"]);
  });

  it("names nothing it does not know (a type or a window the form cannot get wrong)", () => {
    expect(missingKeysOf(new Set(["requestType", "channel", "contactWindow"]), {})).toEqual([]);
  });
});

describe("formContext: the shape", () => {
  it("type, visible, consent, missing and submit; the type is the canonical id", () => {
    const f = formContext(snap({ requestType: "testdrive", formMissing: ["slots", "consent"], consentGiven: false, status: "none" }));
    expect(f).toEqual({ phase: "open_filling", type: "testdrive", missing: ["slots", "consent"], consent: false, visible: true, submit: "none" });
  });

  it("requestId only after a real send", () => {
    expect(formContext(snap({ requestId: "ABCD1234", status: "none" }))).not.toHaveProperty("requestId");
    expect(formContext(snap({ requestId: "ABCD1234", status: "sending" }))).not.toHaveProperty("requestId");
    expect(formContext(snap({ requestId: "ABCD1234", status: "error" }))).not.toHaveProperty("requestId");
    expect(formContext(snap({ requestId: "ABCD1234", status: "sent" }))).toMatchObject({ submit: "sent", requestId: "ABCD1234" });
    expect(formContext(snap({ requestId: null, status: "sent" }))).not.toHaveProperty("requestId");
  });

  it("the submit state follows the real result, and a sent request has nothing missing and stays complete", () => {
    for (const status of SUBMIT_STATES) expect(formContext(snap({ status })).submit).toBe(status);
    const sent = formContext(snap({ status: "sent", requestId: "X1", formMissing: ["name", "consent"], dialogOpen: false }));
    expect(sent).toMatchObject({ phase: "complete", missing: [] });
  });

  it("values only in the phase complete (this site's rule: the reference gives them from the tick on), in every submit state", () => {
    for (const status of SUBMIT_STATES) expect(formContext(snap({ status })), status).toHaveProperty("values");
    expect(formContext(snap({ formMissing: ["consent"], consentGiven: false }))).not.toHaveProperty("values"); // no_consent
    expect(formContext(snap({ formMissing: ["phone_or_email"], consentGiven: true }))).not.toHaveProperty("values"); // a tick, but something else missing: the reference would give them, this site does not
    expect(formContext(snap({ formMissing: ["name"], dialogOpen: false }))).not.toHaveProperty("values"); // incomplete
    expect(formContext(snap({ everOpened: false, dialogOpen: false, formMissing: [] }))).not.toHaveProperty("values"); // not_opened
    expect(formContext(snap({}), false)).not.toHaveProperty("values"); // AGENT_INCLUDE_FORM off
    expect(formContext(snap({}), false)).toMatchObject({ phase: "complete" });
  });

  it("no personal data anywhere outside values: states, names of fields, the number", () => {
    const text = JSON.stringify(formContext(snap({ formMissing: ["phone_or_email"], status: "error" })));
    expect(text).not.toMatch(/Max Muster|example\.invalid|Hello/);
  });
});

describe("valuesOf: by type, the reference's keys", () => {
  it("a question: name, email, phone, channel, window, message; no slots, no amount", () => {
    expect(valuesOf(snap({ phone: "+00 000 000 000", preferredChannel: "phone", contactWindow: "morning" }))).toEqual({ name: "Max Muster", email: "max@example.invalid", phone: "+00 000 000 000", channel: "phone", window: "morning", message: "Hello" });
  });

  it("slots for a viewing and a test drive only", () => {
    const slots = [{ date: "2026-06-11", time: "10:00" }, { date: "2026-06-13", time: "15:00" }];
    for (const requestType of ["viewing", "testdrive"] as const) expect(valuesOf(snap({ requestType, preferredSlots: slots })).slots).toEqual(slots);
    expect(valuesOf(snap({ requestType: "question", preferredSlots: slots }))).not.toHaveProperty("slots");
  });

  it("the amount of an offer as a number (null when it does not read as one), for an offer only", () => {
    expect(valuesOf(snap({ requestType: "offer", amount: "50.000" })).amount).toBe(50000);
    expect(valuesOf(snap({ requestType: "offer", amount: "49500,5" })).amount).toBe(49500.5);
    expect(valuesOf(snap({ requestType: "offer", amount: "" })).amount).toBeNull();
    expect(valuesOf(snap({ requestType: "question", amount: "50.000" }))).not.toHaveProperty("amount");
  });

  it("hasValuesOf counts the tick and a window other than anytime as something entered", () => {
    resetFormSnapshotForTests();
    expect(hasValuesOf(getFormSnapshot())).toBe(false);
    for (const patch of [{ consentGiven: true }, { contactWindow: "morning" }, { name: "x" }, { amount: "5" }, { preferredChannel: "email" }]) {
      resetFormSnapshotForTests();
      updateFormSnapshot(patch);
      expect(hasValuesOf(getFormSnapshot()), JSON.stringify(patch)).toBe(true);
    }
  });
});

describe("contactNavResets: navigation to the form after a send", () => {
  const done = { sent: true, sentType: "viewing" };
  it("the agent with the same type keeps the sent request; another type, or a visitor's link, starts a new one", () => {
    expect(contactNavResets({ ...done, type: "viewing", agent: true })).toBe(false);
    expect(contactNavResets({ ...done, type: "offer", agent: true })).toBe(true);
    expect(contactNavResets({ ...done, type: "viewing", agent: false })).toBe(true);
  });
  it("nothing to reset unless the request was sent", () => {
    expect(contactNavResets({ sent: false, sentType: "viewing", type: "offer", agent: true })).toBe(false);
    expect(contactNavResets({ sent: false, sentType: null, type: "viewing", agent: false })).toBe(false);
  });
});

describe("navigationType: the type the agent's navigation opens", () => {
  const all = ["viewing", "testdrive", "question", "offer"] as const;
  const noViewing = ["question", "offer"] as const;
  it("the type asked for, when the product offers it; testdrive and test_drive are the same", () => {
    for (const t of all) expect(navigationType(t, all)).toBe(t);
    expect(navigationType("test_drive", all)).toBe("testdrive");
  });
  it("a type the product does not offer, or nonsense, falls back to the default type (a question)", () => {
    expect(navigationType("viewing", noViewing)).toBe("question");
    expect(navigationType("testdrive", ["viewing", "question", "offer"])).toBe("question");
    for (const bad of ["", "booking", "toString", undefined, null, 3, "OFFER"]) expect(navigationType(bad, all), String(bad)).toBe("question");
    expect(navigationType("offer", ["offer"])).toBe("offer");
    expect(navigationType("viewing", ["offer"])).toBe("offer"); // no question here: the first type there is
  });
  it("plain #contact is a viewing, or the first type the product offers when it has none", () => {
    expect(navigationType("contact", all)).toBe("viewing");
    expect(navigationType("contact", noViewing)).toBe("question");
    expect(navigationType("contact", ["offer", "question"])).toBe("offer");
    expect(navigationType("contact", [])).toBe("question");
  });
});
