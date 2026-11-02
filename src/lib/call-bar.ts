// The text of the call bar: the pill at the bottom of a phone screen that stands for the docked Sofia card (components/AgentAvatarCard.tsx,
// `.avatar-card__bar`). Pure functions (no DOM), so every state of the bar is a unit test.
import type { CardState } from "./agent-state";
import type { ResolvedAvatar } from "./avatar-manifest";
import { pick } from "./i18n";
import type { CallPhase } from "./call-outcome";
import type { Language } from "./languages";
import { ui, uiFmt } from "./ui-strings";

export type BarKind = "idle" | "connecting" | "live" | "error";

/** The phone's width up to which the bar replaces the docked card (the header's own breakpoint: 56.25em, 900px). */
export const BAR_QUERY = "(width < 56.25em)";

/** Which of the four faces the bar shows for a call phase: a call that did not start or dropped is an error. */
export function barKind(phase: CallPhase): BarKind {
  if (phase === "connecting") return "connecting";
  if (phase === "live") return "live";
  if (phase === "failed" || phase === "dropped") return "error";
  return "idle";
}

/** Seconds as the timer of a live call: "00:01", "12:05", and "1:02:03" from an hour on. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type BarText = {
  /** The first line: bold. */
  title: string;
  /** Small text after the title on the same line (the role while waiting); "" for none. */
  small: string;
  /** The timer of a live call ("00:01"), which never gives way to an ellipsis; "" for none. */
  timer: string;
  /** The second line. */
  line: string;
};

/**
 * What the two lines say. Waiting: the name (and the job) over her invitation. Connecting: the status over a hint for the browser's question.
 * In a call: "Live call" and the timer over whether she listens or speaks. A failed or dropped call: what happened (in a word) over "Try again".
 * No example conversation is ever in it.
 */
export function barText({ kind, phase, state, avatar, lang, seconds }: { kind: BarKind; phase: CallPhase; state: CardState; avatar: Pick<ResolvedAvatar, "name" | "role">; lang: Language; seconds: number }): BarText {
  const name = avatar.name;
  if (kind === "connecting") return { title: ui("agent.bar.connecting", lang), small: "", timer: "", line: ui("agent.bar.mic", lang) };
  if (kind === "live") {
    return { title: ui("agent.bar.live", lang), small: "", timer: formatTimer(seconds), line: uiFmt(state === "speaking" ? "agent.bar.speaking" : "agent.bar.listening", lang, { name }) };
  }
  if (kind === "error") return { title: ui(phase === "dropped" ? "agent.bar.dropped" : "agent.bar.failed", lang), small: "", timer: "", line: ui("agent.bar.retry", lang) };
  return { title: name, small: avatar.role ? pick(avatar.role, lang) : "", timer: "", line: ui("agent.bar.invite", lang) };
}
