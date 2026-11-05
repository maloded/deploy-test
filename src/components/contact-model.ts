"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANYTIME } from "@/lib/contact-windows";
import { missingKeysOf } from "@/lib/form-context";
import { localeOf } from "@/lib/languages";
import { channelAvailable, FIELDS, validateLead, type LeadErrors, type LeadField } from "@/lib/lead";
import { updateFormSnapshot } from "@/lib/form-snapshot";
import { amountProblem, formatAmount, parseAmount, type OfferBounds } from "@/lib/offer-amount";
import { DEFAULT_REQUEST_TYPE, needsSlots, type RequestType } from "@/lib/request-types";
import { MAX_SLOTS, slotProblem, type SlotProblem, type ViewingConfig } from "@/lib/viewing";
import type { Language } from "@/lib/schema";

export type Failure = "invalid" | "tooFast" | "rate" | "unavailable";
export type Status = "idle" | "sending" | "success" | "error";

/** One preferred time the visitor picked: a day and a time of the seller's calendar. */
export type SlotInput = { date: string; time: string };
/** What is wrong with a picked time: a problem of the slot rules, or a repeat. */
export type SlotError = SlotProblem | "missing" | "duplicate";

export type Values = {
  requestType: RequestType;
  slots: SlotInput[];
  name: string;
  email: string;
  phone: string;
  /** The amount of an offer, as typed ("50.000", "49500,5"); sent only with an offer request. */
  amount: string;
  channel: string;
  /** The code of a contact window (contact-windows.ts); only sent when the preferred channel is not e-mail. */
  contactWindow: string;
  message: string;
  consent: boolean;
  /** The honeypot. */
  website: string;
};
const EMPTY: Values = { requestType: DEFAULT_REQUEST_TYPE, slots: [], name: "", email: "", phone: "", amount: "", channel: "", contactWindow: ANYTIME, message: "", consent: false, website: "" };

/** The problem of each picked time, or null: one the slot rules refuse (the picker offers only good ones, so this is the server's rule as a second line), or a repeat. */
function slotRowErrors(rows: SlotInput[], viewing: ViewingConfig): (SlotError | null)[] {
  return rows.map((s, i) => {
    const seen = rows.findIndex((o) => o.date === s.date && o.time === s.time);
    return slotProblem(s, viewing) ?? (seen !== i ? "duplicate" : null);
  });
}

/** The window that is sent and shown to the agent: the select is hidden for e-mail, and then the answer is "anytime". */
export const effectiveWindow = (v: Pick<Values, "channel" | "contactWindow">): string => (v.channel === "email" ? ANYTIME : v.contactWindow);

/**
 * The body the lead schema checks (the submit and the snapshot build it the same way). `agent`: the voice assistant led the visitor to the form during a call, so the
 * request says so (source "agent"); the amount goes only with an offer, as a number when it reads as one.
 */
function leadBody(values: Values, lang: Language, viewing: ViewingConfig | null, elapsedMs: number, agent: boolean) {
  const wantsSlots = needsSlots(values.requestType) && viewing !== null;
  const complete = (wantsSlots ? values.slots : []).filter((s) => s.date && s.time);
  const { slots: _slots, amount, ...fields } = values;
  void _slots;
  const locale = localeOf(lang);
  const offered = values.requestType === "offer" && amount.trim() !== "" ? { amount: Number.isFinite(parseAmount(amount, locale)) ? parseAmount(amount, locale) : amount } : {};
  return { wantsSlots, body: { ...fields, ...offered, source: agent ? ("agent" as const) : ("form" as const), contactWindow: effectiveWindow(values), lang, ...(wantsSlots ? { preferredSlots: complete } : {}), elapsedMs } };
}

/** The amount outside the product's range is a problem the shared schema does not know (the range is the product's): the one more error the form checks. */
function rangeErrors(body: { amount?: unknown }, type: RequestType, offer: OfferBounds | null): LeadErrors {
  if (type !== "offer" || body.amount === undefined) return {};
  return typeof body.amount === "number" && amountProblem(body.amount, offer) !== null ? { amount: "amount" } : {};
}

/** Where focus goes after a submit: the error summary, or the success panel. */
export type Attention = { target: "summary" | "success"; n: number };

export type ContactModel = ReturnType<typeof useContactModel>;

/**
 * The form model of the contact dialog. The values are only here (in this component's state): the page API on section#contact (open and close) has no way to read or write them.
 */
export function useContactModel({ lang, viewing, offer, price = null, onSubmitted }: { lang: Language; viewing: ViewingConfig | null; /** The product's fixed asking price (not a rent per month): an offer starts with it in the amount field; null: the field starts empty. */ price?: number | null; /** The range of the amount an offer may name (the product's); null: no range to check. */ offer: OfferBounds | null; onSubmitted: () => void }) {
  // an empty request: the amount of an offer starts at the asking price (as the page language writes it), which counts as filled until the visitor clears it
  const blank = useMemo<Values>(() => ({ ...EMPTY, amount: price !== null && price > 0 ? formatAmount(price, localeOf(lang)) : "" }), [price, lang]);
  const [values, setValues] = useState<Values>(blank);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [slotErrors, setSlotErrors] = useState<(SlotError | null)[]>([]);
  /** The type of the request that was sent last (the success text differs for a viewing). */
  const [sentType, setSentType] = useState<RequestType | null>(null);
  /** The visitor was led to the form by the voice assistant during a call: the request says so and a few fields are optional. Set by the page API (open), cleared by the visitor opening the form themselves and after a send. */
  const [agent, setAgent] = useState(false);
  const startedAt = useRef<number | null>(null);
  const sending = useRef(false);
  const tick = useRef(0);

  // After a successful send the form is empty but the snapshot keeps the sent values; it stays frozen until the visitor edits a field.
  const frozen = useRef(false);
  /** An edit by the visitor: the outcome of the last send no longer describes the form. */
  const edited = useCallback(() => {
    frozen.current = false;
    updateFormSnapshot({ submit: "none", status: "none", requestId: null });
  }, []);

  /** The channel the visitor pressed while it was not usable yet ("email": no valid e-mail address, "phone": no valid phone number): the form says what to enter first. */
  const [channelHint, setChannelHint] = useState<"email" | "phone" | null>(null);
  /** The day the picker shows the times of (a YYYY-MM-DD of the seller's calendar). */
  const [slotDay, setSlotDay] = useState("");
  /** The number the server gave the request that was sent (the success screen shows it). */
  const [requestNumber, setRequestNumber] = useState<string | null>(null);

  const set = useCallback((name: keyof Values, value: string | boolean) => {
    if (startedAt.current === null) startedAt.current = Date.now(); // the fill time starts at the first keystroke
    edited();
    setValues((v) => {
      const next = { ...v, [name]: value };
      // a channel that cannot be used without the e-mail address or the phone number just changed falls back to "no preference", live
      if ((name === "email" || name === "phone") && !channelAvailable(next.channel, next)) next.channel = "";
      return next;
    });
    setErrors((e) => (name in e ? { ...e, [name]: undefined } : e));
  }, [edited]);

  /** A channel chip: a usable one is chosen; one that needs an e-mail address or a phone number not entered yet only shows what to enter. */
  const pickChannel = useCallback((channel: string, contact: { email: string; phone: string }) => {
    if (startedAt.current === null) startedAt.current = Date.now();
    edited();
    if (!channelAvailable(channel, contact)) {
      setChannelHint(channel === "email" ? "email" : "phone");
      return;
    }
    setChannelHint(null);
    setValues((v) => ({ ...v, channel }));
  }, [edited]);

  /** The pressed button's preset: only the type select changes; what was typed stays, and the fill timer is not started by it. */
  const setPreset = useCallback((type: RequestType) => {
    setValues((v) => (v.requestType === type ? v : { ...v, requestType: type }));
    setErrors((e) => (e.requestType ? { ...e, requestType: undefined } : e));
  }, []);

  /** A time chip: it adds the time of the day shown to the picked ones (up to the maximum), or takes it away again. */
  const toggleSlot = useCallback((slot: SlotInput) => {
    if (startedAt.current === null) startedAt.current = Date.now();
    edited();
    setValues((v) => {
      const at = v.slots.findIndex((s) => s.date === slot.date && s.time === slot.time);
      const next = at >= 0 ? v.slots.filter((_, i) => i !== at) : v.slots.length < MAX_SLOTS ? [...v.slots, slot].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)) : v.slots;
      return { ...v, slots: next };
    });
    setSlotErrors([]);
    setErrors((e) => (e.preferredSlots ? { ...e, preferredSlots: undefined } : e));
  }, [edited]);

  const removeSlot = useCallback((index: number) => {
    edited();
    setValues((v) => ({ ...v, slots: v.slots.filter((_, i) => i !== index) }));
    setSlotErrors([]);
  }, [edited]);

  // The snapshot the page can show to the voice assistant (src/lib/form-snapshot.ts): updated on every change, kept after a
  // successful submit and after the dialog closes. The reset after a successful submit is not a change by the visitor.
  useEffect(() => {
    if (frozen.current) {
      updateFormSnapshot({ language: lang });
      return;
    }
    const { wantsSlots, body } = leadBody(values, lang, viewing, 0, agent);
    // one rule set: validateLead (listing every blocking field at once) plus slotRowErrors for the slot rows and the product's range for the amount; valid and missing all come from it
    const checked = validateLead(body);
    const blocking = new Set<string>([...(checked.ok ? [] : Object.keys(checked.errors)), ...Object.keys(rangeErrors(body, values.requestType, offer))]);
    if (wantsSlots && slotRowErrors(values.slots, viewing!).some(Boolean)) blocking.add("preferredSlots");
    const valid = blocking.size === 0;
    const missing = FIELDS.filter((f) => blocking.has(f));
    // the same blocking fields in the agent's words (form.missing): phone_or_email when both contact fields are empty, slots, amount ...
    const codes = checked.ok ? {} : checked.errors;
    const formMissing = missingKeysOf(blocking, { email: codes.email, phone: codes.phone });
    updateFormSnapshot({
      requestType: values.requestType,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      preferredChannel: values.channel,
      contactWindow: effectiveWindow(values),
      message: values.message.trim(),
      amount: values.requestType === "offer" ? values.amount.trim() : "",
      preferredSlots: values.slots.filter((s) => s.date && s.time).map((s) => ({ date: s.date, time: s.time })),
      language: lang,
      consentGiven: values.consent,
      valid,
      missing,
      formMissing,
    });
  }, [values, lang, viewing, offer, agent]);

  const submit = useCallback(
    async () => {
      if (sending.current) return;
      const focus = (target: Attention["target"]) => setAttention({ target, n: ++tick.current });
      const { wantsSlots, body } = leadBody(values, lang, viewing, startedAt.current === null ? 0 : Date.now() - startedAt.current, agent);
      const rowErrors = wantsSlots ? slotRowErrors(values.slots, viewing!) : [];
      const checked = validateLead(body);
      const range = rangeErrors(body, values.requestType, offer);
      setSlotErrors(rowErrors);
      if (!checked.ok || rowErrors.some(Boolean) || Object.keys(range).length > 0) {
        setErrors({ ...(checked.ok ? (rowErrors.some(Boolean) ? { preferredSlots: "invalid" as const } : {}) : checked.errors), ...range });
        setFailure(null);
        setStatus("error");
        focus("summary");
        return;
      }
      sending.current = true;
      setChannelHint(null);
      setErrors({});
      setFailure(null);
      setStatus("sending");
      updateFormSnapshot({ status: "sending" }); // the agent can see the request is in flight
      let next: Failure | "ok" | "fields" = "unavailable";
      let serverErrors: LeadErrors = {};
      let requestId: string | null = null;
      try {
        const res = await fetch("/api/lead", {
          method: "POST",
          headers: { "content-type": "application/json", "x-lead-request": "1" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: unknown; errors?: LeadErrors } | null;
        if (res.ok && json?.ok === true) {
          next = "ok";
          if (typeof json.id === "string") requestId = json.id;
        }
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
        setRequestNumber(requestId);
        frozen.current = true;
        updateFormSnapshot({ submit: "sent", status: "sent", requestId });
        setAgent(false);
        setValues(blank);
        setSlotErrors([]);
        startedAt.current = null;
        setStatus("success");
        focus("success");
        onSubmitted();
      } else {
        updateFormSnapshot({ submit: "failed", status: "error" });
        if (next === "fields") setErrors(serverErrors);
        setFailure(next === "fields" ? null : next);
        setStatus("error");
        focus("summary");
      }
    },
    [values, lang, viewing, offer, agent, onSubmitted, blank],
  );

  /**
   * A new request: what a request left behind is gone (the sent state and its number, the typed values, the errors, the consent) and the next send starts afresh. The agent
   * asking for another kind of request after a send does this (form-context.ts contactNavResets), as does a visitor's link; the same kind again does not.
   */
  const reset = useCallback(() => {
    frozen.current = false;
    startedAt.current = null;
    sending.current = false;
    setValues({ ...blank, slots: [{ date: "", time: "" }] }); // a fresh object: the snapshot effect runs again
    setErrors({});
    setFailure(null);
    setSlotErrors([]);
    setSentType(null);
    setRequestNumber(null);
    setChannelHint(null);
    setSlotDay("");
    setStatus("idle");
    updateFormSnapshot({ submit: "none", status: "none", requestId: null });
  }, [blank]);

  /** "Another request": a new, empty request of the type that was sent (the same type, nothing of the old one: no values, no number, no consent). */
  const again = useCallback(() => {
    reset();
    if (sentType !== null) setPreset(sentType);
  }, [reset, sentType, setPreset]);

  return { values, errors, status, failure, attention, slotErrors, sentType, requestNumber, channelHint, slotDay, setSlotDay, viewing, offer, price, agent, setAgent, reset, again, set, setPreset, pickChannel, toggleSlot, removeSlot, submit };
}

export type { LeadField };
