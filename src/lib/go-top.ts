// Back to the top of the page: the one routine behind the agent's "#top" navigation and the logo links of the header and the footer.

/** Smooth scrolling unless the visitor asked for less motion. */
export const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * Smooth scroll to the top (instant with prefers-reduced-motion), then focus on the page's main landmark so the next Tab
 * starts at the content, without scrolling again. When a dialog is open (the contact form) focus stays
 * where it is: a modal dialog owns it.
 */
export function goToTop(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  if (document.querySelector("dialog[open]")) return;
  document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
}

/** The address without its hash (the language path and the query stay), without a new history entry: a reload then stays at the top. Nothing happens without a hash. */
export function clearHash(): void {
  if (!window.location.hash) return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}
