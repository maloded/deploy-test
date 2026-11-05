"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ContactOpenOptions } from "@/lib/agent-bridge";
import { updateFormSnapshot } from "@/lib/form-snapshot";
import { contactNavResets } from "@/lib/form-context";
import type { OfferBounds } from "@/lib/offer-amount";
import { canonicalRequestType, DEFAULT_REQUEST_TYPE, navigationType, REQUEST_TYPES, resolvePreset, type RequestType } from "@/lib/request-types";
import type { ViewingConfig } from "@/lib/viewing";
import type { Language } from "@/lib/schema";
import { ui } from "@/lib/ui-strings";
import { ContactForm } from "./ContactForm";
import type { ContactWindow } from "@/lib/contact-windows";
import { useContactModel } from "./contact-model";
import { FooterIcon } from "./footer-icons";

/**
 * Methods placed on the contact element (the footer's contact row, #contact) for the voice agent and other outside callers. Exactly
 * these two: nothing the visitor typed can be read or written from outside, and the consent can only be given in the
 * page itself. (Contact data that an agent collects by voice goes to the server, not through the page.)
 */
export type ContactApi = { open(options?: ContactOpenOptions): void; close(): void };
export type ContactElement = HTMLElement & ContactApi;

const noSubscription = () => () => {};

/**
 * Option for later, NOT enabled: when true, the dialog moves focus to the Name input only on devices with a fine
 * pointer (a mouse or a trackpad), so a phone's on-screen keyboard does not open over the form. Documented in
 * PROJECT.md as the fix if the keyboard covers the form.
 */
const AUTOFOCUS_ONLY_WITH_FINE_POINTER = false;

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]):not([tabindex='-1']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The dialog's title: "Request details" for a question, "Make an offer" for an offer, the type's label for the others. */
const dialogTitle = (type: RequestType, lang: Language): string =>
  type === "question" ? ui("contact.title", lang) : type === "offer" ? ui("contact.title.offer", lang) : REQUEST_TYPES[type].label[lang];

/**
 * Where focus goes when the dialog opens (and when the agent leads to another type): the first field the form still needs, in page order: the first day of the picker
 * when no time is picked yet (a viewing or test drive), the amount (an offer), the name, the phone number or e-mail (an offer needs both: the one that is empty), the question (a question
 * request) and the consent box; the Name input when all are filled. A request the agent opened (form[data-agent]) does not need the times, the amount or the question.
 */
function firstEmptyField(dialog: HTMLElement): HTMLElement | null {
  const get = (selector: string) => dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  const empty = (el: HTMLInputElement | HTMLTextAreaElement | null): el is HTMLInputElement | HTMLTextAreaElement => el !== null && el.value.trim() === "";
  const agent = dialog.querySelector<HTMLElement>("form")?.dataset.agent === "true";
  // a viewing or test drive with no time picked yet: the first day of the strip
  const day = dialog.querySelector<HTMLElement>(".contact__slots .contact__day");
  if (!agent && day && dialog.querySelector(".contact__pick:not(.is-empty)") === null) return day;
  // an offer: the amount field, prefilled with the asking price, takes focus (the caret goes to the end, see focusField) so that it can be edited right away
  const amount = get("[name=amount]");
  if (amount !== null && (!agent || !empty(amount))) return amount; // in a call it is optional: it takes focus only when it starts with a price
  const name = get("[name=name]");
  if (empty(name)) return name;
  const email = get("[name=email]");
  const phone = get("[name=phone]");
  if (amount !== null) {
    if (empty(email)) return email; // an offer needs both
    if (empty(phone)) return phone;
  } else if (empty(email) && empty(phone)) return email;
  const message = get("[name=message]");
  if (message?.required && empty(message)) return message;
  const consent = get("[name=consent]");
  if (consent && !(consent as HTMLInputElement).checked) return consent;
  return name;
}

/** Focus, and in a text field the caret after the last character (a prefilled amount is edited from its end). */
function focusField(el: HTMLElement | null) {
  if (!el) return;
  el.focus();
  if (el instanceof HTMLInputElement && el.type === "text") {
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // an input type without a selection: the caret stays where it is
    }
  }
}

/**
 * The contact block lives in the footer: its contact row (the seller's e-mail and phone, and the privacy and imprint
 * links when the seller has them) is the element with id="contact", and it hosts the agent interface. There is no
 * button of its own: the buttons of the page (header, hero, offer) are `#contact` links. With JavaScript they open the
 * form in a native <dialog>; without it they scroll to this row, whose mailto link works. The form exists ONLY in the
 * dialog, and only after the page has loaded in a browser: the static markup holds no form field.
 */
export function ContactSection({ lang, contactWindows, timezone, email, phone, requestTypes, viewing, offer, price, currency, prototypeNote, consentText, privacyUrl }: { lang: Language; contactWindows: readonly ContactWindow[]; timezone?: string; email: string; phone?: string; requestTypes: readonly RequestType[]; viewing: ViewingConfig | null; /** The range of the amount an offer may name, and the currency of the product's price. */ offer: OfferBounds | null; /** The fixed asking price an offer starts from (null for a price per month and so on: the field starts empty). */ price?: number | null; currency: string; prototypeNote: boolean; consentText: string; privacyUrl?: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);
  /** The target of the last pointerdown inside the dialog. */
  const pressed = useRef<EventTarget | null>(null);
  const formId = useId();
  const titleId = useId();
  const [modal, setModal] = useState(false);
  /** The type the dialog was opened with: it names the dialog (the visitor may still change the select). */
  const [opened, setOpened] = useState<RequestType>(DEFAULT_REQUEST_TYPE);
  // false in the server's HTML and in the first client render, true afterwards: then the form exists
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);

  const emit = useCallback((name: "contact-open" | "contact-close" | "contact-submitted") => {
    sectionRef.current?.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: {} })); // no personal data, ever
  }, []);

  const model = useContactModel({ lang, viewing, offer, price, onSubmitted: () => emit("contact-submitted") });

  const { setPreset, setAgent, reset } = model;
  /** A counter: each change moves focus to the first field the form still needs, after the form has rendered the fields of its (new) type. */
  const [focusTick, setFocusTick] = useState(0);

  const open = useCallback(
    (from?: Element | null, options?: ContactOpenOptions) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      // the type the agent or an address with a #contact-<type> hash asks for (one the product does not offer falls back to the default), or null: the pressed button's preset
      const requested = typeof options?.type === "string" ? navigationType(options.type, requestTypes) : null;
      const agent = options?.agent === true; // the voice assistant opened it during a call (the bridge says so), or the visitor did
      const viaAgent = options?.by === "agent"; // the agent's navigate (a call is running then): it keeps a sent request when it asks for the same type again
      // after a send, the agent leading to the same type keeps the sent request (its answer stays "sent"); another type, or any link, button or address of the visitor,
      // starts a new request (an empty form of that type)
      let fresh = false;
      const wanted = requested ?? resolvePreset((from as HTMLElement | null | undefined)?.dataset?.requestType, requestTypes);
      if ((requested !== null || !isOpen.current) && contactNavResets({ sent: model.status === "success", sentType: model.sentType, type: wanted, agent: viaAgent })) {
        reset();
        fresh = true;
      }
      if (isOpen.current) {
        // already open: leading to another type switches to it (what was typed stays); the same type changes nothing and moves nothing
        if (requested !== null && (fresh || requested !== model.values.requestType)) {
          setPreset(requested);
          setAgent(agent);
          setOpened(requested);
          setFocusTick((n) => n + 1);
        }
        return;
      }
      isOpen.current = true;
      const type = wanted;
      setPreset(type);
      setAgent(agent);
      setOpened(type);
      opener.current = (from ?? document.activeElement) as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      setModal(true);
      updateFormSnapshot({ dialogOpen: true, everOpened: true });
      emit("contact-open");
      setFocusTick((n) => n + 1);
    },
    [emit, setPreset, setAgent, reset, requestTypes, model.status, model.sentType, model.values.requestType],
  );

  // "Another request" (the success panel): the model has made a new request of the same type; focus goes to its first field
  const again = useCallback(() => {
    model.again();
    setFocusTick((n) => n + 1);
  }, [model]);

  // on a phone the on-screen keyboard covers the lower part of the window: the dialog is as tall as what is left (the visual viewport), and a field that gets focus is scrolled
  // into view, after the keyboard has come up, so that the focused field and the send button are never under it
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!modal || !dialog) return;
    const vv = window.visualViewport;
    const fit = () => dialog.style.setProperty("--contact-vv", vv ? `${Math.round(vv.height)}px` : "100dvh");
    fit();
    vv?.addEventListener("resize", fit);
    let timer = 0;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches?.("input, textarea, select, button")) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.scrollIntoView?.({ block: "nearest", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 300);
    };
    dialog.addEventListener("focusin", onFocus);
    return () => {
      vv?.removeEventListener("resize", fit);
      dialog.removeEventListener("focusin", onFocus);
      window.clearTimeout(timer);
      dialog.style.removeProperty("--contact-vv");
    };
  }, [modal]);

  // focus goes to the first field the form still needs (not the select, not the close button), once the form shows the fields of its type
  useEffect(() => {
    const dialog = dialogRef.current;
    if (focusTick === 0 || !dialog) return;
    if (!AUTOFOCUS_ONLY_WITH_FINE_POINTER || window.matchMedia?.("(pointer: fine)").matches) focusField(firstEmptyField(dialog));
    else dialog.querySelector<HTMLElement>(".contact-dialog__title")?.focus();
  }, [focusTick]);

  // the freshest open for the effects below, which must not run again every time it changes
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  // an address with #contact-<type> opens the form on that type, as the agent's navigate does (a plain #contact stays what it was: it scrolls to this row, the header button's way)
  useEffect(() => {
    if (!ready) return;
    const fromAddress = () => {
      let hash = window.location.hash;
      try {
        hash = decodeURIComponent(hash);
      } catch {
        // keep it as it is
      }
      const m = /^#contact-([a-z_]+)$/i.exec(hash);
      const type = m ? canonicalRequestType(m[1].toLowerCase()) : null;
      if (type !== null) openRef.current(undefined, { type });
    };
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    return () => window.removeEventListener("hashchange", fromAddress);
  }, [ready]);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen.current) return;
    isOpen.current = false;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    setModal(false);
    updateFormSnapshot({ dialogOpen: false });
    emit("contact-close");
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus();
  }, [emit]);

  // every "#contact" link outside the band opens the dialog, except one marked data-contact="scroll" (the header button: it scrolls)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href="#contact"]');
      if (!link || sectionRef.current?.contains(link)) return;
      if (link.getAttribute("data-contact") === "scroll") return; // the header's button: the browser scrolls to the footer's contact row
      e.preventDefault();
      open(link as HTMLElement);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  // the page API
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const api: ContactApi = { open: (options) => open(undefined, options), close };
    Object.assign(el, api);
    return () => {
      delete (el as Partial<ContactApi>).open;
      delete (el as Partial<ContactApi>).close;
    };
  }, [open, close]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div ref={sectionRef} className="site-footer__contact" id="contact" data-block="contact" role="group" aria-label={ui("footer.contact", lang)}>
      {/* one row: a link per kind of request this page offers (it opens the form on that tab, like every "#contact" button; without script it scrolls here), then the e-mail */}
      <p className="site-footer__contact-title" aria-hidden="true">
        {ui("footer.contact", lang)}
      </p>
      <ul className="site-footer__links">
        {requestTypes.map((type) => (
          <li key={type}>
            <a
              href="#contact"
              data-request-type={type}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                open(e.currentTarget);
              }}
            >
              <FooterIcon name={type} />
              <span>{REQUEST_TYPES[type].label[lang]}</span>
            </a>
          </li>
        ))}
        <li className="site-footer__links-line">
          <a href={`mailto:${email}`}>
            <FooterIcon name="mail" />
            <span>{email}</span>
          </a>
        </li>
        {phone && (
          <li className="site-footer__links-line">
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
              <FooterIcon name="phone" />
              <span>{phone}</span>
            </a>
          </li>
        )}
      </ul>

      <dialog
        ref={dialogRef}
        className="contact-dialog"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onPointerDown={(e) => {
          pressed.current = e.target; // where a press started: a drag that starts inside and ends outside must not close
        }}
        onClick={(e) => {
          // all content sits in the inner box, so a click whose target is the dialog element itself is a click on the backdrop
          const backdropClick = e.target === e.currentTarget && pressed.current === e.currentTarget;
          pressed.current = null;
          if (backdropClick && model.status !== "sending") close(); // not while a request is in flight
        }}
      >
        <div className="contact-dialog__box">
          <div className="contact-dialog__bar">
            <h2 className="contact-dialog__title" id={titleId} tabIndex={-1}>
              {dialogTitle(opened, lang)}
            </h2>
            <button type="button" className="contact-dialog__close" aria-label={ui("contact.close", lang)} onClick={close}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {/* only this body scrolls; the title row above stays in place */}
          <div className="contact-dialog__body">
            {ready && <ContactForm model={model} idBase={formId} lang={lang} currency={currency} contactWindows={contactWindows} timezone={timezone} email={email} requestTypes={requestTypes} prototypeNote={prototypeNote} consentText={consentText} privacyUrl={privacyUrl} onDone={close} onAgain={again} />}
          </div>
        </div>
      </dialog>
    </div>
  );
}
