"use client";

import { useCallback, useRef, useState } from "react";
import { validateLead, type LeadErrors, type LeadField } from "@/lib/lead";
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
  bestTime: string;
  message: string;
  consent: boolean;
  /** The honeypot. */
  website: string;
};
const EMPTY: Values = { requestType: DEFAULT_REQUEST_TYPE, slots: [{ date: "", time: "" }], name: "", email: "", phone: "", channel: "", bestTime: "", message: "", consent: false, website: "" };

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

  const set = useCallback((name: keyof Values, value: string | boolean) => {
    if (startedAt.current === null) startedAt.current = Date.now(); // the fill time starts at the first keystroke
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (name in e ? { ...e, [name]: undefined } : e));
  }, []);

  /** The pressed button's preset: only the type select changes; what was typed stays, and the fill timer is not started by it. */
  const setPreset = useCallback((type: RequestType) => {
    setValues((v) => (v.requestType === type ? v : { ...v, requestType: type }));
    setErrors((e) => (e.requestType ? { ...e, requestType: undefined } : e));
  }, []);

  const setSlot = useCallback((index: number, part: keyof SlotInput, value: string) => {
    if (startedAt.current === null) startedAt.current = Date.now();
    setValues((v) => ({ ...v, slots: v.slots.map((s, i) => (i === index ? { ...s, [part]: value } : s)) }));
    setSlotErrors((e) => e.map((x, i) => (i === index ? null : x)));
    setErrors((e) => (e.preferredSlots ? { ...e, preferredSlots: undefined } : e));
  }, []);

  const addSlot = useCallback(() => setValues((v) => (v.slots.length < MAX_SLOTS ? { ...v, slots: [...v.slots, { date: "", time: "" }] } : v)), []);

  const removeSlot = useCallback((index: number) => {
    setValues((v) => ({ ...v, slots: v.slots.length > 1 ? v.slots.filter((_, i) => i !== index) : [{ date: "", time: "" }] }));
    setSlotErrors([]);
  }, []);

  const submit = useCallback(
    async () => {
      if (sending.current) return;
      const focus = (target: Attention["target"]) => setAttention({ target, n: ++tick.current });
      const wantsSlots = needsSlots(values.requestType) && viewing !== null;
      // blank rows are ignored; a half-filled row, or a row the slot rules refuse, is an error of that row
      const rows = wantsSlots ? values.slots : [];
      const rowErrors: (SlotError | null)[] = rows.map((s, i) => {
        if (!s.date && !s.time) return null;
        if (!s.date || !s.time) return "missing";
        const seen = rows.findIndex((o) => o.date === s.date && o.time === s.time);
        return slotProblem(s, viewing!) ?? (seen !== i ? "duplicate" : null);
      });
      const complete = rows.filter((s) => s.date && s.time);
      const { slots: _slots, ...fields } = values;
      void _slots;
      const body = { ...fields, lang, ...(wantsSlots ? { preferredSlots: complete } : {}), elapsedMs: startedAt.current === null ? 0 : Date.now() - startedAt.current };
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
        setValues(EMPTY);
        setSlotErrors([]);
        startedAt.current = null;
        setStatus("success");
        focus("success");
        onSubmitted();
      } else {
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
