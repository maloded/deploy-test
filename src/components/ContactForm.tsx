"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { windowLabel, zoneHint, type ContactWindow } from "@/lib/contact-windows";
import { channelAvailable, CHANNELS, LIMITS, type LeadField } from "@/lib/lead";
import { pick } from "@/lib/i18n";
import { localeOf } from "@/lib/languages";
import { amountProblem, differenceText, formatAmountInput, parseAmount, type OfferBounds } from "@/lib/offer-amount";
import { needsSlots, REQUEST_TYPES, type RequestType } from "@/lib/request-types";
import { bookableDays, DAYS, MAX_SLOTS, slotProblem, timeSlots } from "@/lib/viewing";
import type { Language } from "@/lib/schema";
import { ui, uiFmt, type UiKey } from "@/lib/ui-strings";
import type { ContactModel } from "./contact-model";

/** The range goes into the message only for an amount that is a number outside it; anything else the field says is the general one. */
const errorText = (field: string, code: string, lang: Language, money: (n: number) => string, offer: OfferBounds | null, outOfRange: boolean) =>
  field === "preferredSlots"
    ? ui(code === "required" ? "contact.error.slotRequired" : "contact.error.slots", lang)
    : code === "amount"
      ? offer && outOfRange
        ? uiFmt("contact.error.amount", lang, { min: money(offer.min), max: money(offer.max) })
        : ui("contact.error.invalid", lang)
      : uiFmt(`contact.error.${code}` as UiKey, lang, { max: LIMITS.message });

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
  currency,
  contactWindows,
  timezone,
  email,
  requestTypes,
  prototypeNote,
  consentText,
  privacyUrl,
  onDone,
  onAgain,
}: {
  model: ContactModel;
  idBase: string;
  lang: Language;
  /** The currency of the product's price: the amount of an offer is in it. */
  currency: string;
  /** The windows of the select (the seller's override or the defaults). */
  contactWindows: readonly ContactWindow[];
  /** The seller's time zone, for the hint under the select; none, no hint. */
  timezone?: string;
  email: string;
  /** The kinds of request this product accepts, in the order of the select. */
  requestTypes: readonly RequestType[];
  /** NEXT_PUBLIC_PROTOTYPE_NOTE is set: one honest line near the button says requests are not delivered yet. */
  prototypeNote: boolean;
  consentText: string;
  /** The seller's privacy page; no link at all when the seller has none. */
  privacyUrl?: string;
  /** Called by the success panel's "close" button (the dialog closes). */
  onDone: () => void;
  /** Called by the success panel's "another request" button, after the model has started the new request (focus goes to its first field). */
  onAgain: () => void;
}) {
  const { values, errors, status, failure } = model;
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const id = (name: string) => `${idBase}-${name}`;
  /** The element a summary link focuses: the first date for the preferred times. */
  const fieldId = (name: LeadField) => (name === "preferredSlots" ? id("day-0") : id(name));

  // after a submit that failed, the summary takes focus; after a success, the panel's button (in the dialog) does
  const attention = model.attention;
  useEffect(() => {
    if (!attention) return;
    (attention.target === "success" ? doneRef.current : summaryRef.current)?.focus();
  }, [attention]);

  const fieldErrors = (Object.keys(errors) as (LeadField | "form")[]).filter((k): k is LeadField => k !== "form" && Boolean(errors[k]));
  const describe = (name: LeadField, extra?: string) => [errors[name] ? id(`${name}-error`) : null, extra].filter(Boolean).join(" ") || undefined;
  // `hint` replaces "optional" for a field of which one of two is needed ("phone or e-mail")
  const label = (name: LeadField, key: UiKey, required: boolean, hint?: UiKey) => (
    <label htmlFor={id(name)}>
      {ui(key, lang)}
      {required ? <span aria-hidden="true"> *</span> : <span className="contact__optional"> ({ui(hint ?? "contact.optional", lang)})</span>}
    </label>
  );
  const money = (n: number) => {
    try {
      return new Intl.NumberFormat(localeOf(lang), { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  };
  const isOffer = values.requestType === "offer";
  /** The currency's sign ("€") for the end of the amount field; its code where Intl has none. */
  const currencySign = (() => {
    try {
      return new Intl.NumberFormat(localeOf(lang), { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
    } catch {
      return currency;
    }
  })();
  const agent = model.agent;
  const range = model.offer;
  const price = model.price;
  const amount = parseAmount(values.amount, localeOf(lang));
  const outOfRange = Number.isFinite(amount) && amountProblem(amount, range) === "range";
  // the live difference to the asking price (only for a fixed price): nothing while the amount is no number or empty
  const diffLine =
    isOffer && price !== null && Number.isFinite(amount) && amount > 0
      ? amount === price
        ? ui("contact.amount.same", lang)
        : uiFmt("contact.amount.diff", lang, { diff: differenceText(amount, price, currency, localeOf(lang)) })
      : null;
  const fieldError = (name: LeadField) =>
    errors[name] ? (
      <p className="contact__error" id={id(`${name}-error`)}>
        {errorText(name, errors[name]!, lang, money, range, outOfRange)}
      </p>
    ) : null;
  const common = (name: Exclude<LeadField, "consent" | "channel" | "requestType" | "preferredSlots" | "contactWindow">) => ({
    id: id(name),
    name,
    value: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": describe(name),
    onChange: (e: { target: { value: string } }) => model.set(name, e.target.value),
  });

  const hint = zoneHint(timezone, lang);
  const showPrivacyLink = Boolean(privacyUrl) && !consentPointsToPrivacy(consentText, ui("contact.privacy", lang), privacyUrl!);
  const viewing = model.viewing;
  const withSlots = needsSlots(values.requestType) && viewing !== null;
  /** What to bring: the test drive's own note where there is one, else the general one. */
  const notes = values.requestType === "testdrive" ? (viewing?.testDriveNotes ?? viewing?.notes) : viewing?.notes;

  const locale = localeOf(lang);
  /** The channel the visitor pressed that needs an e-mail address or a phone number first, until it has one. */
  const channelNeed = model.channelHint !== null && !channelAvailable(model.channelHint === "email" ? "email" : "phone", values) ? model.channelHint : null;
  const dayPart = (ymd: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(new Date(`${ymd}T12:00:00Z`));
  const slotText = (slot: { date: string; time: string }) => `${dayPart(slot.date, { weekday: "short", day: "2-digit", month: "2-digit" })} · ${slot.time}`;
  /** The picker: the next days with visits (a short strip), the day shown, the times of the day. */
  const days = withSlots && viewing ? bookableDays(viewing, 14) : [];
  const day = days.includes(model.slotDay) ? model.slotDay : (days[0] ?? "");
  const times = withSlots && viewing ? timeSlots(viewing) : [];
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  /** Tablist keys: the arrows (and Home and End) move to the neighbouring request type, which is chosen at once, and keep the focus on its tab. */
  const onTabKeys = (e: KeyboardEvent) => {
    const at = requestTypes.indexOf(values.requestType);
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? requestTypes[(at + 1) % requestTypes.length] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? requestTypes[(at - 1 + requestTypes.length) % requestTypes.length] : e.key === "Home" ? requestTypes[0] : e.key === "End" ? requestTypes[requestTypes.length - 1] : null;
    if (next === null) return;
    e.preventDefault();
    model.set("requestType", next);
    tabs.current[next]?.focus();
  };

  if (status === "success") {
    const sent = model.sentType;
    const text = sent !== null && needsSlots(sent) ? "contact.success.viewing" : sent === "offer" ? "contact.success.offer" : "contact.success.text";
    return (
      <div className="contact__success" role="status">
        <h3 className="contact__success-title">{ui("contact.success.title", lang)}</h3>
        <p>{ui(text, lang)}</p>
        {model.requestNumber && (
          <p className="contact__number">
            {ui("contact.success.number", lang)} <b>#{model.requestNumber}</b>
          </p>
        )}
        <div className="contact__success-actions">
          <button type="button" className="button button--outline" onClick={onAgain}>
            {ui("contact.again", lang)}
          </button>
          <button ref={doneRef} type="button" className="button" onClick={onDone}>
            {ui("contact.close", lang)}
          </button>
        </div>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void model.submit();
  };

  return (
    <form className="contact__form" noValidate onSubmit={onSubmit} aria-describedby={id("note")} data-agent={agent ? "true" : undefined}>
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
                    <span>: {errorText(name, errors[name]!, lang, money, range, outOfRange)}</span>
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

      <div className="contact__tabs" role="tablist" aria-label={ui("contact.requestType", lang)} onKeyDown={onTabKeys}>
        {requestTypes.map((t) => {
          const selected = values.requestType === t;
          return (
            <button
              key={t}
              ref={(el) => {
                tabs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={id(`tab-${t}`)}
              data-type={t}
              className="contact__tab"
              aria-selected={selected}
              aria-controls={id("panel")}
              tabIndex={selected ? 0 : -1}
              onClick={() => model.set("requestType", t)}
            >
              {REQUEST_TYPES[t].label[lang]}
            </button>
          );
        })}
      </div>
      {fieldError("requestType")}

      <div role="tabpanel" id={id("panel")} aria-labelledby={id(`tab-${values.requestType}`)} className="contact__panel">
      {withSlots && viewing && (
        <fieldset className="contact__slots" aria-describedby={id("slots-hint")}>
          <legend>
            {ui("contact.preferredSlots", lang)}
            {agent ? <span className="contact__optional"> ({ui("contact.optional", lang)})</span> : <span aria-hidden="true"> *</span>}
          </legend>
          {agent && <p className="contact__hint">{ui("contact.agentOptional", lang)}</p>}
          <dl className="contact__viewing">
            <dt>{ui("contact.slots.address", lang)}</dt>
            <dd>{pick(viewing.address, lang)}</dd>
            {notes && (
              <>
                <dt>{ui("contact.slots.notes", lang)}</dt>
                <dd>{pick(notes, lang)}</dd>
              </>
            )}
          </dl>
          <p className="contact__note" id={id("slots-hint")}>
            {uiFmt("contact.slots.hint", lang, { max: MAX_SLOTS })}{" "}
            {uiFmt("contact.slots.available", lang, { days: dayNames(viewing.days, lang), from: viewing.from, to: viewing.to })}{" "}
            {uiFmt("contact.slots.zone", lang, { zone: viewing.timezone })}
          </p>
          <ol className="contact__picked" aria-live="polite">
            {Array.from({ length: MAX_SLOTS }, (_, i) => {
              const slot = values.slots[i];
              const err = model.slotErrors[i];
              return slot ? (
                <li className="contact__pick" key={i}>
                  <b>{i + 1}</b>
                  <span>{slotText(slot)}</span>
                  <button type="button" className="contact__pick-remove" aria-label={uiFmt("contact.slots.remove", lang, { n: i + 1 })} onClick={() => model.removeSlot(i)}>
                    <span aria-hidden="true">×</span>
                  </button>
                  {err && (
                    <em className="contact__error" id={id(`slot-${i}-error`)}>
                      {uiFmt(`contact.error.slot.${err}` as UiKey, lang, { days: dayNames(viewing.days, lang), max: 60 })}
                    </em>
                  )}
                </li>
              ) : (
                <li className="contact__pick is-empty" key={i}>
                  <b>{i + 1}</b>
                  <span>{ui("contact.slots.pick", lang)}</span>
                </li>
              );
            })}
          </ol>
          <div className="contact__days" role="group" aria-label={ui("contact.slots.day", lang)}>
            {days.map((d, i) => (
              <button key={d} id={id(`day-${i}`)} type="button" className="contact__day" aria-pressed={d === day} data-day={d} onClick={() => model.setSlotDay(d)}>
                <small>{dayPart(d, { weekday: "short" })}</small>
                <b>{dayPart(d, { day: "numeric" })}</b>
                <small>{dayPart(d, { month: "short" })}</small>
                {values.slots.some((x) => x.date === d) && <i className="contact__dot" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="contact__times" role="group" aria-label={ui("contact.slots.times", lang)}>
            {times.map((t) => {
              const picked = values.slots.some((x) => x.date === day && x.time === t);
              const off = !picked && (values.slots.length >= MAX_SLOTS || slotProblem({ date: day, time: t }, viewing) !== null);
              return (
                <button key={t} type="button" className="contact__time" aria-pressed={picked} disabled={off} data-time={t} onClick={() => model.toggleSlot({ date: day, time: t })}>
                  {t}
                </button>
              );
            })}
          </div>
          {fieldError("preferredSlots")}
        </fieldset>
      )}

      {isOffer && (
        <div className="contact__field">
          {label("amount", "contact.amount", !agent)}
          <div className="contact__amount-box">
            <input type="text" inputMode="decimal" autoComplete="off" required={!agent} maxLength={20} {...common("amount")} onBlur={() => {
                // the value as the page language writes it ("50.000", "50,000"); a blur that changes nothing is not an edit (it would undo the state of a send)
                const shown = formatAmountInput(values.amount, locale);
                if (values.amount.trim() !== "" && shown !== values.amount) model.set("amount", shown);
              }} aria-describedby={describe("amount", id("amount-hint"))} />
            <span className="contact__amount-unit" aria-hidden="true">{currencySign}</span>
          </div>
          <p className="contact__hint" id={id("amount-hint")} aria-live="polite" hidden={!diffLine && !agent}>
            {diffLine} {agent && ui("contact.agentOptional", lang)}
          </p>
          {fieldError("amount")}
        </div>
      )}

      <div className="contact__grid">
        <div className="contact__field">
          {label("name", "contact.name", true)}
          <input type="text" autoComplete="name" required maxLength={LIMITS.name} {...common("name")} />
          {fieldError("name")}
        </div>
        <div className="contact__field">
          {label("email", "contact.email", isOffer, "contact.either")}
          <input type="email" autoComplete="email" inputMode="email" required={isOffer} maxLength={LIMITS.email} {...common("email")} />
          {fieldError("email")}
        </div>
        <div className="contact__field">
          {label("phone", "contact.phone", isOffer, "contact.either")}
          <input type="tel" autoComplete="tel" inputMode="tel" required={isOffer} maxLength={LIMITS.phone} {...common("phone")} />
          {fieldError("phone")}
        </div>
        <fieldset className="contact__field contact__field--wide contact__chipset">
          <legend>
            {ui("contact.channel", lang)}
            <span className="contact__optional"> ({ui("contact.optional", lang)})</span>
          </legend>
          <div className="contact__chips" role="group" aria-label={ui("contact.channel", lang)}>
            {["", ...CHANNELS].map((c) => {
              const off = !channelAvailable(c, values);
              return (
                <button key={c || "none"} type="button" className={off ? "contact__chip is-off" : "contact__chip"} data-channel={c} aria-pressed={values.channel === c} aria-disabled={off ? true : undefined} onClick={() => model.pickChannel(c, values)}>
                  {ui(c === "" ? "contact.channel.none" : (`contact.channel.${c}` as UiKey), lang)}
                </button>
              );
            })}
          </div>
          {channelNeed && (
            <p className="contact__hint" role="status">
              {ui(channelNeed === "email" ? "contact.channel.needEmail" : "contact.channel.needPhone", lang)}
            </p>
          )}
        </fieldset>
        {values.channel !== "email" && (
          <fieldset className="contact__field contact__field--wide contact__chipset">
            <legend>{ui("contact.contactWindow", lang)}</legend>
            <div className="contact__chips" role="group" aria-label={ui("contact.contactWindow", lang)} aria-describedby={hint ? id("contactWindow-hint") : undefined}>
              {contactWindows.map((w) => (
                <button key={w.code} type="button" className="contact__chip" data-window={w.code} aria-pressed={values.contactWindow === w.code} onClick={() => model.set("contactWindow", w.code)}>
                  {windowLabel(w, lang)}
                </button>
              ))}
            </div>
            {hint && (
              <p className="contact__hint" id={id("contactWindow-hint")}>
                {hint}
              </p>
            )}
          </fieldset>
        )}
        <div className="contact__field contact__field--wide">
          <div className="contact__label-row">
            {label("message", "contact.message", values.requestType === "question" && !agent)}
            <span className="contact__count" id={id("count")}>
              {uiFmt("contact.count", lang, { n: values.message.length, max: LIMITS.message })}
            </span>
          </div>
          <textarea rows={3} maxLength={LIMITS.message} required={values.requestType === "question" && !agent} {...common("message")} aria-describedby={describe("message", id("count"))} />
          {agent && values.requestType === "question" && <p className="contact__hint">{ui("contact.agentOptional", lang)}</p>}
          {fieldError("message")}
        </div>
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

      <div className="contact__actions">
        {prototypeNote && <p className="contact__prototype">{ui("contact.prototype", lang)}</p>}
        <button type="submit" className="button" disabled={status === "sending"}>
          {ui(status === "sending" ? "contact.sending" : "contact.submit", lang)}
        </button>
      </div>
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
