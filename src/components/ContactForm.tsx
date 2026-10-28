"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { CHANNELS, LIMITS, type LeadField } from "@/lib/lead";
import { pick } from "@/lib/i18n";
import { localeOf } from "@/lib/languages";
import { needsSlots, REQUEST_TYPES, type RequestType } from "@/lib/request-types";
import { bookingWindow, DAYS, MAX_SLOTS, timeSlots } from "@/lib/viewing";
import type { Language } from "@/lib/schema";
import { ui, uiFmt, type UiKey } from "@/lib/ui-strings";
import type { ContactModel } from "./contact-model";

const errorText = (field: string, code: string, lang: Language) =>
  field === "preferredSlots" ? ui(code === "required" ? "contact.error.slotRequired" : "contact.error.slots", lang) : uiFmt(`contact.error.${code}` as UiKey, lang, { max: LIMITS.message });

/**
 * Whether the consent text already carries the privacy link: it contains the link's target, or its label as a whole word
 * with that capital letter ("Privacy", "Datenschutz"). A sentence such as "the privacy notice" or "Datenschutzerklärung"
 * is not the link, so the link is still added after it.
 */
export function consentPointsToPrivacy(consentText: string, label: string, url: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return consentText.includes(url) || new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u").test(consentText);
}

/** The names of the allowed weekdays in the page language, in week order. */
const dayNames = (days: readonly string[], lang: Language) =>
  DAYS.map((d, i) => [d, new Intl.DateTimeFormat(localeOf(lang), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)))] as const)
    .filter(([d]) => days.includes(d))
    .map(([, name]) => name)
    .join(", ");

/**
 * The contact form, rendered only inside the dialog. It owns no state: the values, errors and status live in the model
 * (contact-model.ts), so what was typed is still there when the dialog is opened again. Every id comes from `idBase`
 * (useId in the parent).
 */
export function ContactForm({
  model,
  idBase,
  lang,
  email,
  requestTypes,
  prototypeNote,
  consentText,
  privacyUrl,
  onDone,
}: {
  model: ContactModel;
  idBase: string;
  lang: Language;
  email: string;
  /** The kinds of request this product accepts, in the order of the select. */
  requestTypes: readonly RequestType[];
  /** NEXT_PUBLIC_PROTOTYPE_NOTE is set: one honest line near the button says requests are not delivered yet. */
  prototypeNote: boolean;
  consentText: string;
  /** The seller's privacy page; no link at all when the seller has none. */
  privacyUrl?: string;
  /** Called by the success panel's button (the dialog closes). */
  onDone: () => void;
}) {
  const { values, errors, status, failure } = model;
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const id = (name: string) => `${idBase}-${name}`;
  /** The element a summary link focuses: the first date for the preferred times. */
  const fieldId = (name: LeadField) => (name === "preferredSlots" ? id("slot-0-date") : id(name));

  // after a submit that failed, the summary takes focus; after a success, the panel's button (in the dialog) does
  const attention = model.attention;
  useEffect(() => {
    if (!attention) return;
    (attention.target === "success" ? doneRef.current : summaryRef.current)?.focus();
  }, [attention]);

  const fieldErrors = (Object.keys(errors) as (LeadField | "form")[]).filter((k): k is LeadField => k !== "form" && Boolean(errors[k]));
  const describe = (name: LeadField, extra?: string) => [errors[name] ? id(`${name}-error`) : null, extra].filter(Boolean).join(" ") || undefined;
  const label = (name: LeadField, key: UiKey, required: boolean) => (
    <label htmlFor={id(name)}>
      {ui(key, lang)}
      {required ? <span aria-hidden="true"> *</span> : <span className="contact__optional"> ({ui("contact.optional", lang)})</span>}
    </label>
  );
  const fieldError = (name: LeadField) =>
    errors[name] ? (
      <p className="contact__error" id={id(`${name}-error`)}>
        {errorText(name, errors[name]!, lang)}
      </p>
    ) : null;
  const common = (name: Exclude<LeadField, "consent" | "channel" | "requestType" | "preferredSlots">) => ({
    id: id(name),
    name,
    value: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": describe(name),
    onChange: (e: { target: { value: string } }) => model.set(name, e.target.value),
  });

  const showPrivacyLink = Boolean(privacyUrl) && !consentPointsToPrivacy(consentText, ui("contact.privacy", lang), privacyUrl!);
  const viewing = model.viewing;
  const withSlots = needsSlots(values.requestType) && viewing !== null;

  if (status === "success") {
    const viewed = model.sentType !== null && needsSlots(model.sentType);
    return (
      <div className="contact__success" role="status">
        <h3 className="contact__success-title">{ui("contact.success.title", lang)}</h3>
        <p>{ui(viewed ? "contact.success.viewing" : "contact.success.text", lang)}</p>
        <button ref={doneRef} type="button" className="button" onClick={onDone}>
          {ui("contact.close", lang)}
        </button>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void model.submit();
  };

  return (
    <form className="contact__form" noValidate onSubmit={onSubmit} aria-describedby={id("note")}>
      {(fieldErrors.length > 0 || failure) && (
        <div className="contact__summary" ref={summaryRef} tabIndex={-1} role="alert">
          {failure ? (
            <>
              {failure === "unavailable" ? <UnavailableText lang={lang} email={email} /> : <p>{ui(`contact.error.${failure}` as UiKey, lang)}</p>}
              {failure === "rate" && (
                <p>
                  {ui("contact.mailto", lang)} <a href={`mailto:${email}`}>{email}</a>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="contact__summary-title">{ui("contact.error.summary", lang)}</p>
              <ul>
                {fieldErrors.map((name) => (
                  <li key={name}>
                    <a
                      href={`#${fieldId(name)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(fieldId(name))?.focus();
                      }}
                    >
                      {ui(`contact.${name}` as UiKey, lang)}
                    </a>
                    <span>: {errorText(name, errors[name]!, lang)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <p className="contact__note" id={id("note")}>
        {ui("contact.reassurance", lang)} {ui("contact.requiredNote", lang)}
      </p>

      <div className="contact__field contact__field--type">
        {label("requestType", "contact.requestType", true)}
        <select
          id={id("requestType")}
          name="requestType"
          value={values.requestType}
          aria-invalid={errors.requestType ? true : undefined}
          aria-describedby={describe("requestType")}
          onChange={(e) => model.set("requestType", e.target.value)}
        >
          {requestTypes.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPES[t].label[lang]}
            </option>
          ))}
        </select>
        {fieldError("requestType")}
      </div>

      {withSlots && viewing && (
        <fieldset className="contact__slots" aria-describedby={id("slots-hint")}>
          <legend>
            {ui("contact.preferredSlots", lang)}
            <span aria-hidden="true"> *</span>
          </legend>
          <dl className="contact__viewing">
            <dt>{ui("contact.slots.address", lang)}</dt>
            <dd>{pick(viewing.address, lang)}</dd>
            {viewing.notes && (
              <>
                <dt>{ui("contact.slots.notes", lang)}</dt>
                <dd>{pick(viewing.notes, lang)}</dd>
              </>
            )}
          </dl>
          <p className="contact__note" id={id("slots-hint")}>
            {uiFmt("contact.slots.hint", lang, { max: MAX_SLOTS })}{" "}
            {uiFmt("contact.slots.available", lang, { days: dayNames(viewing.days, lang), from: viewing.from, to: viewing.to })}{" "}
            {uiFmt("contact.slots.zone", lang, { zone: viewing.timezone })}
          </p>
          {values.slots.map((slot, i) => {
            const window = bookingWindow(viewing);
            const err = model.slotErrors[i];
            const errId = id(`slot-${i}-error`);
            return (
              <div className="contact__slot" key={i}>
                <div className="contact__field">
                  <label htmlFor={id(`slot-${i}-date`)}>{uiFmt("contact.slots.date", lang, { n: i + 1 })}</label>
                  <input
                    type="date"
                    id={id(`slot-${i}-date`)}
                    min={window.min}
                    max={window.max}
                    value={slot.date}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errId : undefined}
                    onChange={(e) => model.setSlot(i, "date", e.target.value)}
                  />
                </div>
                <div className="contact__field">
                  <label htmlFor={id(`slot-${i}-time`)}>{uiFmt("contact.slots.time", lang, { n: i + 1 })}</label>
                  <select id={id(`slot-${i}-time`)} value={slot.time} aria-invalid={err ? true : undefined} aria-describedby={err ? errId : undefined} onChange={(e) => model.setSlot(i, "time", e.target.value)}>
                    <option value="">{ui("contact.slots.select", lang)}</option>
                    {timeSlots(viewing).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {values.slots.length > 1 && (
                  <button type="button" className="contact__slot-remove" aria-label={uiFmt("contact.slots.remove", lang, { n: i + 1 })} onClick={() => model.removeSlot(i)}>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                {err && (
                  <p className="contact__error" id={errId}>
                    {uiFmt(`contact.error.slot.${err}` as UiKey, lang, { days: dayNames(viewing.days, lang), max: 60 })}
                  </p>
                )}
              </div>
            );
          })}
          {values.slots.length < MAX_SLOTS && (
            <button type="button" className="button button--outline button--small contact__slot-add" onClick={model.addSlot}>
              {ui("contact.slots.add", lang)}
            </button>
          )}
          {fieldError("preferredSlots")}
        </fieldset>
      )}

      <div className="contact__grid">
        <div className="contact__field">
          {label("name", "contact.name", true)}
          <input type="text" autoComplete="name" required maxLength={LIMITS.name} {...common("name")} />
          {fieldError("name")}
        </div>
        <div className="contact__field">
          {label("email", "contact.email", true)}
          <input type="email" autoComplete="email" inputMode="email" required maxLength={LIMITS.email} {...common("email")} />
          {fieldError("email")}
        </div>
        <div className="contact__field contact__field--third">
          {label("phone", "contact.phone", false)}
          <input type="tel" autoComplete="tel" inputMode="tel" maxLength={LIMITS.phone} {...common("phone")} />
          {fieldError("phone")}
        </div>
        <div className="contact__field contact__field--third">
          {label("channel", "contact.channel", false)}
          <select id={id("channel")} name="channel" value={values.channel} onChange={(e) => model.set("channel", e.target.value)}>
            <option value="">{ui("contact.channel.none", lang)}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {ui(`contact.channel.${c}` as UiKey, lang)}
              </option>
            ))}
          </select>
        </div>
        <div className="contact__field contact__field--third">
          {label("bestTime", "contact.bestTime", false)}
          <input type="text" maxLength={LIMITS.bestTime} {...common("bestTime")} />
          {fieldError("bestTime")}
        </div>
        <div className="contact__field contact__field--wide">
          <div className="contact__label-row">
            {label("message", "contact.message", false)}
            <span className="contact__count" id={id("count")}>
              {uiFmt("contact.count", lang, { n: values.message.length, max: LIMITS.message })}
            </span>
          </div>
          <textarea rows={3} maxLength={LIMITS.message} {...common("message")} aria-describedby={describe("message", id("count"))} />
          {fieldError("message")}
        </div>
      </div>

      <div className="contact__consent">
        <input
          type="checkbox"
          id={id("consent")}
          name="consent"
          required
          checked={values.consent}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={describe("consent")}
          onChange={(e) => model.set("consent", e.target.checked)}
        />
        <label htmlFor={id("consent")}>
          {consentText}
          {showPrivacyLink && (
            <>
              {" "}
              <a href={privacyUrl}>{ui("contact.privacy", lang)}</a>
            </>
          )}{" "}
          <span aria-hidden="true">*</span>
        </label>
        {fieldError("consent")}
      </div>

      <div className="contact__hp" aria-hidden="true">
        <label htmlFor={id("website")}>{ui("contact.hp", lang)}</label>
        <input type="text" id={id("website")} name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => model.set("website", e.target.value)} />
      </div>

      {prototypeNote && <p className="contact__prototype">{ui("contact.prototype", lang)}</p>}

      <button type="submit" className="button" disabled={status === "sending"}>
        {ui(status === "sending" ? "contact.sending" : "contact.submit", lang)}
      </button>
    </form>
  );
}

/** The "could not be sent" text with the seller's address as a mailto link; without an address, the text without a link. */
function UnavailableText({ lang, email }: { lang: Language; email: string }) {
  if (!email) return <p>{ui("contact.error.unavailableNoMail", lang)}</p>;
  const [before, after] = ui("contact.error.unavailable", lang).split("{email}");
  return (
    <p>
      {before}
      <a href={`mailto:${email}`}>{email}</a>
      {after}
    </p>
  );
}
