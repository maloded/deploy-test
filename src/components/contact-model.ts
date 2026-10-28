"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ANYTIME } from "@/lib/contact-windows";
import { FIELDS, validateLead, type LeadErrors, type LeadField } from "@/lib/lead";
import { updateFormSnapshot } from "@/lib/form-snapshot";
import { DEFAULT_REQUEST_TYPE, needsSlots, type RequestType } from "@/lib/request-types";
import { MAX_SLOTS, slotProblem, type SlotProblem, type ViewingConfig } from "@/lib/viewing";
import type { Language } from "@/lib/schema";

export type Failure = "invalid" | "tooFast" | "rate" | "unavailable";
export type Status = "idle" | "sending" | "success" | "error";

/** One preferred time as typed: both parts may still be empty. */
export type SlotInput = { date: string; time: string };
/** What is wrong with a slot row: a problem of the slot rules, or an incomplete row. */
export type SlotError = SlotProblem | "missing" | "duplicate";

export type Values = {
  requestType: RequestType;
  slots: SlotInput[];
  name: string;
  email: string;
  phone: string;
  channel: string;
  /** The code of a contact window (contact-windows.ts); only sent when the preferred channel is not e-mail. */
  contactWindow: string;
  message: string;
  consent: boolean;
  /** The honeypot. */
  website: string;
};
const EMPTY: Values = { requestType: DEFAULT_REQUEST_TYPE, slots: [{ date: "", time: "" }], name: "", email: "", phone: "", channel: "", contactWindow: ANYTIME, message: "", consent: false, website: "" };

/** The problem of each slot row, or null: blank rows are ignored; a half-filled row, or a row the slot rules refuse, is an error of that row. */
function slotRowErrors(rows: SlotInput[], viewing: ViewingConfig): (SlotError | null)[] {
  return rows.map((s, i) => {
    if (!s.date && !s.time) return null;
    if (!s.date || !s.time) return "missing";
    const seen = rows.findIndex((o) => o.date === s.date && o.time === s.time);
    return slotProblem(s, viewing) ?? (seen !== i ? "duplicate" : null);
  });
}

/** The window that is sent and shown to the agent: the select is hidden for e-mail, and then the answer is "anytime". */
export const effectiveWindow = (v: Pick<Values, "channel" | "contactWindow">): string => (v.channel === "email" ? ANYTIME : v.contactWindow);

/** The body the lead schema checks (the submit and the snapshot build it the same way). */
function leadBody(values: Values, lang: Language, viewing: ViewingConfig | null, elapsedMs: number) {
  const wantsSlots = needsSlots(values.requestType) && viewing !== null;
  const complete = (wantsSlots ? values.slots : []).filter((s) => s.date && s.time);
  const { slots: _slots, ...fields } = values;
  void _slots;
  return { wantsSlots, body: { ...fields, contactWindow: effectiveWindow(values), lang, ...(wantsSlots ? { preferredSlots: complete } : {}), elapsedMs } };
}

/** Where focus goes after a submit: the error summary, or the success panel. */
export type Attention = { target: "summary" | "success"; n: number };

export type ContactModel = ReturnType<typeof useContactModel>;

/**
 * The form model of the contact dialog. The values are only here (in this component's state): the page API on section#contact (open and close) has no way to read or write them.
 */
export function useContactModel({ lang, viewing, onSubmitted }: { lang: Language; viewing: ViewingConfig | null; onSubmitted: () => void }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [slotErrors, setSlotErrors] = useState<(SlotError | null)[]>([]);
  /** The type of the request that was sent last (the success text differs for a viewing). */
  const [sentType, setSentType] = useState<RequestType | null>(null);
  const startedAt = useRef<number | null>(null);
  const sending = useRef(false);
  const tick = useRef(0);

  // After a successful send the form is empty but the snapshot keeps the sent values; it stays frozen until the visitor edits a field.
  const frozen = useRef(false);
  /** An edit by the visitor: the outcome of the last send no longer describes the form. */
  const edited = useCallback(() => {
    frozen.current = false;
    updateFormSnapshot({ submit: "none" });
  }, []);

  const set = useCallback((name: keyof Values, value: string | boolean) => {
    if (startedAt.current === null) startedAt.current = Date.now(); // the fill time starts at the first keystroke
    edited();
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (name in e ? { ...e, [name]: undefined } : e));
  }, [edited]);

  /** The pressed button's preset: only the type select changes; what was typed stays, and the fill timer is not started by it. */
  const setPreset = useCallback((type: RequestType) => {
    setValues((v) => (v.requestType === type ? v : { ...v, requestType: type }));
    setErrors((e) => (e.requestType ? { ...e, requestType: undefined } : e));
  }, []);

  const setSlot = useCallback((index: number, part: keyof SlotInput, value: string) => {
    if (startedAt.current === null) startedAt.current = Date.now();
    edited();
    setValues((v) => ({ ...v, slots: v.slots.map((s, i) => (i === index ? { ...s, [part]: value } : s)) }));
    setSlotErrors((e) => e.map((x, i) => (i === index ? null : x)));
    setErrors((e) => (e.preferredSlots ? { ...e, preferredSlots: undefined } : e));
  }, [edited]);

  const addSlot = useCallback(() => {
    edited();
    setValues((v) => (v.slots.length < MAX_SLOTS ? { ...v, slots: [...v.slots, { date: "", time: "" }] } : v));
  }, [edited]);

  const removeSlot = useCallback((index: number) => {
    edited();
    setValues((v) => ({ ...v, slots: v.slots.length > 1 ? v.slots.filter((_, i) => i !== index) : [{ date: "", time: "" }] }));
    setSlotErrors([]);
  }, [edited]);

  // The snapshot the page can show to the voice assistant (src/lib/form-snapshot.ts): updated on every change, kept after a
  // successful submit and after the dialog closes. The reset after a successful submit is not a change by the visitor.
  useEffect(() => {
    if (frozen.current) {
      updateFormSnapshot({ language: lang });
      return;
    }
    const { wantsSlots, body } = leadBody(values, lang, viewing, 0);
    // one rule set: validateLead (now listing every blocking field at once) plus slotRowErrors for the slot rows; valid and missing both come from it
    const checked = validateLead(body);
    const blocking = new Set<string>(checked.ok ? [] : Object.keys(checked.errors));
    if (wantsSlots && slotRowErrors(values.slots, viewing!).some(Boolean)) blocking.add("preferredSlots");
    const valid = blocking.size === 0;
    const missing = FIELDS.filter((f) => blocking.has(f));
    updateFormSnapshot({
      requestType: values.requestType,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      preferredChannel: values.channel,
      contactWindow: effectiveWindow(values),
      message: values.message.trim(),
      preferredSlots: values.slots.filter((s) => s.date && s.time).map((s) => ({ date: s.date, time: s.time })),
      language: lang,
      consentGiven: values.consent,
      valid,
      missing,
    });
  }, [values, lang, viewing]);

  const submit = useCallback(
    async () => {
      if (sending.current) return;
      const focus = (target: Attention["target"]) => setAttention({ target, n: ++tick.current });
      const { wantsSlots, body } = leadBody(values, lang, viewing, startedAt.current === null ? 0 : Date.now() - startedAt.current);
      const rowErrors = wantsSlots ? slotRowErrors(values.slots, viewing!) : [];
      const checked = validateLead(body);
      setSlotErrors(rowErrors);
      if (!checked.ok || rowErrors.some(Boolean)) {
        setErrors(checked.ok ? { preferredSlots: "invalid" } : checked.errors);
        setFailure(null);
        setStatus("error");
        focus("summary");
        return;
      }
      sending.current = true;
      setErrors({});
      setFailure(null);
      setStatus("sending");
      let next: Failure | "ok" | "fields" = "unavailable";
      let serverErrors: LeadErrors = {};
      try {
        const res = await fetch("/api/lead", {
          method: "POST",
          headers: { "content-type": "application/json", "x-lead-request": "1" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; errors?: LeadErrors } | null;
        if (res.ok && json?.ok === true) next = "ok";
        else if (res.status === 422) next = "tooFast";
        else if (res.status === 429) next = "rate";
        else if (res.status === 400) {
          serverErrors = json?.errors ?? {};
          next = Object.keys(serverErrors).some((k) => k !== "form") ? "fields" : "invalid";
        }
      } catch {
        next = "unavailable"; // no answer at all: nothing was stored
      }
      sending.current = false;
      if (next === "ok") {
        setSentType(values.requestType);
        frozen.current = true;
        updateFormSnapshot({ submit: "sent" });
        setValues(EMPTY);
        setSlotErrors([]);
        startedAt.current = null;
        setStatus("success");
        focus("success");
        onSubmitted();
      } else {
        updateFormSnapshot({ submit: "failed" });
        if (next === "fields") setErrors(serverErrors);
        setFailure(next === "fields" ? null : next);
        setStatus("error");
        focus("summary");
      }
    },
    [values, lang, viewing, onSubmitted],
  );

  return { values, errors, status, failure, attention, slotErrors, sentType, viewing, set, setPreset, setSlot, addSlot, removeSlot, submit };
}

export type { LeadField };
