"use client";

import type { MouseEvent, ReactNode } from "react";
import { clearHash, goToTop } from "@/lib/go-top";

/**
 * The seller's mark and name (header and footer) as a link to the top of the page. Without script it is a plain link to the language page. With script a click scrolls
 * to the top (smoothly, instantly for a visitor who asked for less motion), moves focus to the main landmark as the "#top" navigation does, and clears the hash that
 * "Get in touch" or a contact link left in the address bar (the language path and the query stay), so that a reload stays at the top. A click with a modifier key
 * (a new tab) is left to the browser. The contact dialog is modal: while it is open the logo cannot be reached, so there is nothing to fight with; if one ever is open
 * the scroll happens and focus stays in the dialog (goToTop).
 */
export function BrandLink({ href, label, children }: { href: string; /** The accessible name: where to it leads, with the seller's name first so that the visible words are in it. */ label: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goToTop();
    clearHash();
  };
  return (
    <a className="site-header__brand site-brand-link" href={href} aria-label={label} onClick={onClick}>
      {children}
    </a>
  );
}
