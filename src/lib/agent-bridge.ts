import { canonicalRequestType } from "./request-types";
import type { Language } from "./schema";

/**
 * The page's side of the voice assistant's commands (the widget dispatches "agent-command" on the document, see
 * PAGE-API.md). Registered only when the widget is mounted; nothing here runs without an `agent` in seller.json.
 *
 *  - navigate: answered with preventDefault() alone, and only for a target on THIS page (see navigateTarget); every other
 *    target is left alone, so the agent hears that the site does not support it. Never a full page load (it would end the call).
 *  - page_context: answered once, synchronously, from what the page already has (the platform waits about a second).
 *  - cart_state and every other command: ignored (there is no basket; the documentation names no fields).
 *
 * The agent can open and close the dialog (navigate #contact) and read the page_context answer. It can write no field.
 */

/** What the widget puts in the event's detail (documented: type, payload for navigate, respond). */
type AgentCommandDetail = { type?: unknown; payload?: { path?: unknown } | null; respond?: unknown };

/** "top" with `smooth` is the explicit #top; a plain "/" or "/<lang>" is the same target without it. */
export type NavigateTarget = { kind: "top"; smooth?: true } | { kind: "contact"; type: string } | { kind: "hash"; id: string } | { kind: "gallery"; hash: string };

/**
 * Which place on this page a navigate path means, or null when it is not one. Accepted: "/" or "/<page language>", with no
 * query and with an optional hash: #contact or #contact-<type> (the dialog: see below), #<id of a block this page renders>, or a gallery address when the gallery is
 * rendered: #gallery-<category>, #gallery-<n> (1-based), #photo-<id>, #spot-<id> (which of them exist is the gallery's to say: it answers "unhandled"
 * for a name it does not have). The path is parsed against the page origin; another origin, another language, a query or any other hash is null.
 */
export function navigateTarget(path: unknown, lang: Language, origin: string, renderedBlocks: readonly string[]): NavigateTarget | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.search !== "" || (url.pathname !== "/" && url.pathname !== `/${lang}`)) return null;
  const hash = url.hash;
  if (hash === "") return { kind: "top" };
  // the contact form: #contact (a viewing, or the first type the product offers) and #contact-viewing, -testdrive (or -test_drive), -question, -offer, as on the reference site;
  // any other name after the dash is not a target. Which of them the product offers is the form's to say (it falls back to the default type for one it does not).
  const contact = /^#contact(?:-([a-z_]+))?$/i.exec(safeDecode(hash));
  if (contact) {
    if (contact[1] === undefined) return { kind: "contact", type: "contact" };
    const type = canonicalRequestType(contact[1].toLowerCase());
    return type === null ? null : { kind: "contact", type };
  }
  if (hash === "#top") return { kind: "top", smooth: true };
  const id = hash.slice(1);
  if (id !== "contact" && renderedBlocks.includes(id)) return { kind: "hash", id };
  if (/^#(?:gallery|photo|spot)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hash) && renderedBlocks.includes("gallery")) return { kind: "gallery", hash };
  return null;
}

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The ids of the blocks the page renders, as the layout publishes them. */
const renderedBlockIds = (): string[] => (document.querySelector<HTMLElement>("[data-block-order]")?.dataset.blockOrder ?? "").split(" ").filter(Boolean);

type ContactApi = { open?: unknown };
/** What the bridge tells the contact row when it opens the form: the agent did it during a call. */
export type ContactOpenOptions = {
  /** A call is running: the request will say it comes from the agent (source "agent"). */
  agent?: boolean;
  /** Who led to the form: "agent" for the voice assistant's navigate (also without a running call). A send is only kept (not reset) when the agent leads to the same type again. */
  by?: "agent";
  /** The kind of request to open: a request type's id ("testdrive" and "test_drive" both), or "contact" for a viewing / the first offered type. One the product does not offer opens the default type. */
  type?: string;
};

/**
 * #top: smooth scroll to the top (instant with prefers-reduced-motion), then focus on the page's main landmark so the next Tab
 * starts at the content, without scrolling again. When a dialog is open (the contact form) focus stays
 * where it is: a modal dialog owns it. Never a page load, never the root redirect.
 */
function goToTop(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  if (document.querySelector("dialog[open]")) return;
  document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
}
/** Smooth scrolling unless the visitor asked for less motion. */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * A gallery address (#gallery-<category>, #gallery-<n>, #photo-<id>, #spot-<id>) through the gallery's own showAddress: it slides to the
 * photo (instantly under reduced motion), scrolls the gallery into view, writes the address, and queues the change while the visitor is
 * swiping or tapping. "handled" and "queued" are answered; "unhandled" (an unknown name) and a gallery that is not interactive yet are not.
 */
function showGalleryAddress(hash: string): boolean {
  const gallery = document.getElementById("gallery") as (HTMLElement & { showAddress?: unknown }) | null;
  if (typeof gallery?.showAddress !== "function") return false;
  return (gallery.showAddress as (hash: string) => string)(hash) !== "unhandled";
}

/**
 * Registers the handler on the document and returns the function that removes it. `product` is the
 * "<seller>/<product>" reference. The answer of page_context is built by `answer`.
 */
export function registerAgentBridge({ lang, answer, callActive = () => false }: { lang: Language; answer: () => unknown; /** Whether a call is running now: a form the agent opens then is marked as the agent's (the request's source). */ callActive?: () => boolean }): () => void {
  const onCommand = (event: Event) => {
    const detail = (event as CustomEvent<AgentCommandDetail>).detail;
    if (!detail || typeof detail !== "object" || typeof detail.respond !== "function") return;
    const respond = detail.respond as (data: unknown) => void;

    if (detail.type === "navigate") {
      const target = navigateTarget(detail.payload?.path, lang, window.location.origin, renderedBlockIds());
      if (!target) return; // not preventDefault(): the agent is told the site does not support it
      if (target.kind === "contact") {
        const contact = document.getElementById("contact") as (HTMLElement & ContactApi) | null;
        if (typeof contact?.open !== "function") return; // the page is not interactive yet
        event.preventDefault();
        (contact.open as (options?: ContactOpenOptions) => void)({ type: target.type, by: "agent", ...(callActive() ? { agent: true } : {}) });
      } else if (target.kind === "top") {
        event.preventDefault();
        if (target.smooth) goToTop();
        else window.scrollTo({ top: 0 });
      } else if (target.kind === "gallery") {
        if (!showGalleryAddress(target.hash)) return; // an unknown name: not handled, the agent is told
        event.preventDefault();
      } else {
        event.preventDefault();
        window.location.hash = target.id; // scrolls; a hash change never reloads the page
      }
    } else if (detail.type === "page_context") {
      event.preventDefault();
      respond(answer()); // synchronous, from what the page has
    }
    // cart_state and anything else: not handled
  };
  document.addEventListener("agent-command", onCommand);
  return () => document.removeEventListener("agent-command", onCommand);
}
