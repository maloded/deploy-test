"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { updateFormSnapshot } from "@/lib/form-snapshot";
import { DEFAULT_REQUEST_TYPE, REQUEST_TYPES, resolvePreset, type RequestType } from "@/lib/request-types";
import type { ViewingConfig } from "@/lib/viewing";
import type { Language } from "@/lib/schema";
import { ui } from "@/lib/ui-strings";
import { ContactForm } from "./ContactForm";
import type { ContactWindow } from "@/lib/contact-windows";
import { useContactModel } from "./contact-model";

/**
 * Methods placed on the contact element (the footer's contact row, #contact) for the voice agent and other outside callers. Exactly
 * these two: nothing the visitor typed can be read or written from outside, and the consent can only be given in the
 * page itself. (Contact data that an agent collects by voice goes to the server, not through the page.)
 */
export type ContactApi = { open(): void; close(): void };
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
 * Where focus goes when the dialog opens: the first required field that is still empty, in page order: name, e-mail, the
 * date of the first preferred time (when the request type shows them), the consent box; the Name input when all are filled.
 */
function firstEmptyRequired(dialog: HTMLElement): HTMLElement | null {
  const get = (selector: string) => dialog.querySelector<HTMLInputElement>(selector);
  const name = get("[name=name]");
  const empty = (el: HTMLInputElement | null): el is HTMLInputElement => el !== null && el.value.trim() === "";
  const date = get(".contact__slot input[type=date]");
  const consent = get("[name=consent]");
  if (empty(name)) return name;
  const email = get("[name=email]");
  if (empty(email)) return email;
  if (empty(date)) return date;
  if (consent && !consent.checked) return consent;
  return name;
}

/**
 * The contact block lives in the footer: its contact row (the seller's e-mail and phone, and the privacy and imprint
 * links when the seller has them) is the element with id="contact", and it hosts the agent interface. There is no
 * button of its own: the buttons of the page (header, hero, offer) are `#contact` links. With JavaScript they open the
 * form in a native <dialog>; without it they scroll to this row, whose mailto link works. The form exists ONLY in the
 * dialog, and only after the page has loaded in a browser: the static markup holds no form field.
 */
export function ContactSection({ lang, contactWindows, timezone, email, phone, requestTypes, viewing, prototypeNote, consentText, privacyUrl, imprintUrl }: { lang: Language; contactWindows: readonly ContactWindow[]; timezone?: string; email: string; phone?: string; requestTypes: readonly RequestType[]; viewing: ViewingConfig | null; prototypeNote: boolean; consentText: string; privacyUrl?: string; imprintUrl?: string }) {
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

  const model = useContactModel({ lang, viewing, onSubmitted: () => emit("contact-submitted") });

  const { setPreset } = model;

  const open = useCallback(
    (from?: Element | null) => {
      const dialog = dialogRef.current;
      if (!dialog || isOpen.current) return;
      isOpen.current = true;
      // the pressed button's preset (data-request-type), or the default type; one the product does not offer falls back to it
      const type = resolvePreset((from as HTMLElement | null | undefined)?.dataset?.requestType, requestTypes);
      setPreset(type);
      setOpened(type);
      opener.current = (from ?? document.activeElement) as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      setModal(true);
      updateFormSnapshot({ dialogOpen: true, everOpened: true });
      emit("contact-open");
      // focus goes to the first empty required field (the Name input when all are empty; not the select, not the close button)
      if (!AUTOFOCUS_ONLY_WITH_FINE_POINTER || window.matchMedia?.("(pointer: fine)").matches) firstEmptyRequired(dialog)?.focus();
      else dialog.querySelector<HTMLElement>(".contact-dialog__title")?.focus();
    },
    [emit, setPreset, requestTypes],
  );

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

  // every "#contact" link outside the band opens the dialog
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href="#contact"]');
      if (!link || sectionRef.current?.contains(link)) return;
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
    const api: ContactApi = { open: () => open(), close };
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
    <div ref={sectionRef} className="site-footer__contact" id="contact" data-block="contact">
      <p className="site-footer__row">
        <span>{ui("footer.contact", lang)}: </span>
        <a href={`mailto:${email}`}>{email}</a>
        {phone && (
          <>
            <span aria-hidden="true"> · </span>
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>
          </>
        )}
        {privacyUrl && (
          <>
            <span aria-hidden="true"> · </span>
            <a href={privacyUrl}>{ui("footer.privacy", lang)}</a>
          </>
        )}
        {imprintUrl && (
          <>
            <span aria-hidden="true"> · </span>
            <a href={imprintUrl}>{ui("footer.imprint", lang)}</a>
          </>
        )}
      </p>

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
            {ready && <ContactForm model={model} idBase={formId} lang={lang} contactWindows={contactWindows} timezone={timezone} email={email} requestTypes={requestTypes} prototypeNote={prototypeNote} consentText={consentText} privacyUrl={privacyUrl} onDone={close} />}
          </div>
        </div>
      </dialog>
    </div>
  );
}
