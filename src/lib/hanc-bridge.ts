// The ONE file that reaches into hanc-webrtc-widgets' internals. The widget is pinned to 2.11.0 (tests/hanc-pin.test.ts); what is
// used here is not documented API, so it can change with any other version. Everything else in src/ gets neutral things only:
// start or end the call, the call status, and what the agent is doing (agentSpeechState). scripts/lib/private-access.mjs (run by
// npm run check:template-clean and by a test) fails when the private names below appear in any other file under src/.
//
// Read only: nothing here writes to the widget, calls its media, or touches the consent (the privacy modal and privacy_accepted
// stay the widget's own). Starting a call is a click on the widget's own button, so its consent check runs as for any visitor.

export const WIDGET_TAG = "hanc-ai-pill-floating-call";

export type CallStatus = "idle" | "connecting" | "connected" | "error";
/** What the agent is doing: idle (no call), listening (in a call; thinking counts as listening), speaking. */
export type AgentSpeechState = "idle" | "listening" | "speaking";

type Participant = { attributes?: Record<string, string> };
type Listener = (...args: unknown[]) => void;
type Room = {
  remoteParticipants?: Map<string, Participant>;
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
};
/** The widget element, as far as this file uses it. */
export type WidgetHost = HTMLElement & {
  callStatus?: unknown;
  toggleCall?: unknown;
  updateComplete?: Promise<unknown>;
  callManager?: { room?: unknown } | null;
};

const AGENT_STATE_ATTRIBUTE = "lk.agent.state";
const ROOM_EVENT_ATTRIBUTES = "participantAttributesChanged";

/** The widget element inside `root`, or null. */
export const findWidget = (root: ParentNode): WidgetHost | null => root.querySelector<WidgetHost>(WIDGET_TAG);

/** The widget's own start/end button (a shadow-DOM part), or null when it is not rendered (yet, or in another version). */
export const pillButtonOf = (host: WidgetHost): HTMLElement | null => host.shadowRoot?.querySelector<HTMLElement>('[part~="pill-button"]') ?? null;

/** The call status, with anything unknown read as idle. */
export function callStatusOf(host: WidgetHost): CallStatus {
  const status = host.callStatus;
  return status === "connecting" || status === "connected" || status === "error" ? status : "idle";
}

/** Waits for the widget element to be defined and rendered; true when its button is there (the custom button can be used). */
export async function whenWidgetReady(host: WidgetHost, timeoutMs = 8000): Promise<boolean> {
  const defined = customElements.whenDefined(WIDGET_TAG).then(() => true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs)));
  const known = await Promise.race([defined, timeout]);
  clearTimeout(timer);
  if (!known) return false;
  try {
    await host.updateComplete;
  } catch {
    return false;
  }
  return pillButtonOf(host) !== null;
}

/**
 * Starts the call, or ends it when one is running: a click on the widget's own button (so the consent modal, the sounds and the
 * state machine run exactly as for a visitor), falling back to the widget's toggle when the button is gone. false: neither exists.
 */
export function toggleCall(host: WidgetHost): boolean {
  const button = pillButtonOf(host);
  if (button) {
    button.click();
    return true;
  }
  if (typeof host.toggleCall === "function") {
    void (host.toggleCall as () => unknown)();
    return true;
  }
  return false;
}

/** The agent's published state ("speaking", "listening", "thinking", "idle", ...) as an agent speech state during a call. */
export const speechFromAttribute = (value: string | undefined): AgentSpeechState => (value === "speaking" ? "speaking" : "listening");

const isRoom = (value: unknown): value is Room => typeof value === "object" && value !== null && typeof (value as Room).on === "function" && typeof (value as Room).off === "function";

/** The agent is the participant that publishes the state attribute (not found by its identity). */
function agentStateIn(room: Room): string | undefined {
  for (const participant of room.remoteParticipants?.values() ?? []) {
    const value = participant.attributes?.[AGENT_STATE_ATTRIBUTE];
    if (value !== undefined) return value;
  }
  return undefined;
}

export type WatchOptions = {
  /** How often to look for the room after the call starts (ms). */
  pollMs?: number;
  /** How long to look before giving up and staying on "listening" for the whole call (ms). */
  giveUpMs?: number;
};

/**
 * Reports what the agent is doing. Idle without a call; when the call starts: "listening" at once, then (when the room is there,
 * polled for up to giveUpMs) the agent's published state first and every change of it after. It stops watching when the call ends
 * (and reports idle). Without a room it stays "listening" for the whole call. Returns a function that stops everything.
 */
export function watchAgentSpeech(host: WidgetHost, onChange: (state: AgentSpeechState) => void, { pollMs = 250, giveUpMs = 10_000 }: WatchOptions = {}): () => void {
  let poll: ReturnType<typeof setTimeout> | null = null;
  let detach: (() => void) | null = null;

  const stopRoom = () => {
    if (poll) clearTimeout(poll);
    poll = null;
    detach?.();
    detach = null;
  };
  const attach = (room: Room) => {
    const onAttributes: Listener = (_changed, participant) => {
      const value = (participant as Participant | undefined)?.attributes?.[AGENT_STATE_ATTRIBUTE];
      if (value !== undefined) onChange(speechFromAttribute(value));
    };
    room.on(ROOM_EVENT_ATTRIBUTES, onAttributes);
    detach = () => room.off(ROOM_EVENT_ATTRIBUTES, onAttributes);
    const existing = agentStateIn(room);
    if (existing !== undefined) onChange(speechFromAttribute(existing));
  };
  const onStart = () => {
    stopRoom();
    onChange("listening");
    const startedAt = Date.now();
    const look = () => {
      const room = host.callManager?.room;
      if (isRoom(room)) return attach(room);
      if (Date.now() - startedAt < giveUpMs) poll = setTimeout(look, pollMs);
    };
    look();
  };
  const onEnd = () => {
    stopRoom();
    onChange("idle");
  };

  host.addEventListener("call-start", onStart);
  host.addEventListener("call-end", onEnd);
  if (callStatusOf(host) === "connected") onStart(); // the card mounted while a call was already running
  return () => {
    host.removeEventListener("call-start", onStart);
    host.removeEventListener("call-end", onEnd);
    stopRoom();
  };
}

/**
 * Reports the call status now and at every change (the widget has no event for connecting and error, so it is read every
 * `pollMs`, and at once at call-start and call-end). Returns a function that stops it.
 */
export function watchCallStatus(host: WidgetHost, onChange: (status: CallStatus) => void, pollMs = 150): () => void {
  let last: CallStatus | null = null;
  const read = () => {
    const now = callStatusOf(host);
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  read();
  const timer = setInterval(read, pollMs);
  host.addEventListener("call-start", read);
  host.addEventListener("call-end", read);
  return () => {
    clearInterval(timer);
    host.removeEventListener("call-start", read);
    host.removeEventListener("call-end", read);
  };
}
