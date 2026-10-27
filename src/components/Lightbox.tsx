"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Language } from "@/lib/schema";
import { ui, uiFmt } from "@/lib/ui-strings";
import type { GallerySlide } from "./gallery-props";

const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

/**
 * Full-screen photo viewer on a native modal <dialog>. Focus handling is explicit (it does not rely on the
 * browser): focus moves to the close button on open, Tab wraps inside the dialog, and the owner of this
 * component returns focus to the element that opened it. Escape closes (native `cancel`).
 */
export function Lightbox({
  slides,
  index,
  lang,
  onIndex,
  onClose,
}: {
  slides: GallerySlide[];
  index: number;
  lang: Language;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = slides.length;
  const slide = slides[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    closeRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowRight" && index < count - 1) {
      e.preventDefault();
      onIndex(index + 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      onIndex(index - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
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
    <dialog ref={dialogRef} className="lightbox" aria-label={ui("lightbox.label", lang)} onKeyDown={onKeyDown} onCancel={(e) => { e.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="lightbox__bar">
        <p className="lightbox__counter">
          {index + 1} / {count}
        </p>
        <button ref={closeRef} type="button" className="lightbox__close" aria-label={ui("lightbox.close", lang)} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="lightbox__stage" role="group" aria-roledescription="slide" aria-label={uiFmt("gallery.slide", lang, { n: index + 1, total: count })}>
        <Image className="lightbox__img" src={slide.src} width={slide.width} height={slide.height} alt={slide.alt} sizes="100vw" />
        {count > 1 && (
          <>
            <button type="button" className="gallery__nav gallery__nav--prev" aria-label={ui("gallery.previous", lang)} disabled={index === 0} onClick={() => onIndex(index - 1)} />
            <button type="button" className="gallery__nav gallery__nav--next" aria-label={ui("gallery.next", lang)} disabled={index === count - 1} onClick={() => onIndex(index + 1)} />
          </>
        )}
      </div>
    </dialog>
  );
}
