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

export type NavigateTarget = { kind: "top" } | { kind: "contact" } | { kind: "hash"; id: string };

/**
 * Which place on this page a navigate path means, or null when it is not one. Accepted: "/" or "/<page language>", with no
 * query and with an optional hash: #contact (the dialog), #<id of a block this page renders> or #gallery-<n>. The path is
 * parsed against the page origin; another origin, another language, a query or any other hash is null.
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
  if (hash === "#contact") return { kind: "contact" };
  const id = hash.slice(1);
  if (id !== "contact" && renderedBlocks.includes(id)) return { kind: "hash", id };
  if (/^#gallery-[1-9]\d{0,2}$/.test(hash) && renderedBlocks.includes("gallery")) return { kind: "hash", id: hash.slice(1) };
  return null;
}

/** The ids of the blocks the page renders, as the layout publishes them. */
const renderedBlockIds = (): string[] => (document.querySelector<HTMLElement>("[data-block-order]")?.dataset.blockOrder ?? "").split(" ").filter(Boolean);

type ContactApi = { open?: unknown };

/**
 * Registers the handler on the document and returns the function that removes it. `product` is the
 * "<seller>/<product>" reference. The answer of page_context is built by `answer`.
 */
export function registerAgentBridge({ lang, answer }: { lang: Language; answer: () => unknown }): () => void {
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
        (contact.open as () => void)();
      } else if (target.kind === "top") {
        event.preventDefault();
        window.scrollTo({ top: 0 });
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
