/**
 * The example call on the card: an illustrative exchange that types itself in line by line, ported from the Hanc role hero
 * (src/components/v3/role/RoleHero.astro, "Example captions"; the timings are Hanc's). Two lines are on screen, the newest at the bottom;
 * each word of a line fades from 0.18 to full at 170 ms per word, 140 ms after the line appears; the next line follows 1100 ms after the last
 * word, and after the last line the exchange waits 3200 ms and starts over (500 ms after the lines left). Changes of position are FLIP
 * animations (320 ms), a new line slides in over 260 ms (160 ms late after the first).
 *
 * It works on the DOM that AgentCaptions renders: `[data-cap-head]`, `[data-line]` (with `data-who`) and `[data-w]` for each word. It only
 * toggles `data-on`, `data-past` and `data-said` on them, sets `data-talking` on the card while the agent's words come (the level bars move),
 * and animates with the Web Animations API where there is one. Nothing is sent anywhere.
 */
export const WORD_DELAY = 170;
export const FIRST_WORD = 140;
export const NEXT_LINE = 1100;
export const RESTART_AFTER = 3200;
export const RESTART_DELAY = 500;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export type ExampleCallEngine = {
  /** Whether the exchange should run now (on screen, tab visible, no call, motion welcome). Starts or stops it. */
  update(should: boolean): void;
  /** Shows the first two lines, whole and still (reduced motion). */
  showStatic(): void;
  stop(): void;
};

export function createExampleCall(root: HTMLElement, card: HTMLElement): ExampleCallEngine {
  const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
  const head = root.querySelector<HTMLElement>("[data-cap-head]");
  const words = (li: HTMLElement) => Array.from(li.querySelectorAll<HTMLElement>("[data-w]"));
  let timers: number[] = [];
  let running = false;
  let idx = -1;
  const clear = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
  };
  const later = (fn: () => void, ms: number) => void timers.push(window.setTimeout(fn, ms));
  const on = (li: HTMLElement, name: "on" | "past", value: boolean) => {
    if (value) li.dataset[name] = "";
    else delete li.dataset[name];
  };

  function showStatic() {
    lines.forEach((li, i) => {
      on(li, "on", i < 2);
      on(li, "past", false);
      words(li).forEach((w) => (w.dataset.said = ""));
    });
  }

  function flip(mutate: () => void) {
    const visible = [head, ...lines.filter((l) => "on" in l.dataset)].filter(Boolean) as HTMLElement[];
    const before = new Map(visible.map((l) => [l, l.getBoundingClientRect().top]));
    mutate();
    for (const l of visible) {
      const dy = (before.get(l) || 0) - l.getBoundingClientRect().top;
      if (dy && typeof l.animate === "function") l.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 320, easing: EASE });
    }
  }

  function speak(i: number) {
    idx = i;
    const li = lines[i];
    if (!li) return;
    flip(() =>
      lines.forEach((l, j) => {
        on(l, "on", j === i || j === i - 1);
        on(l, "past", j === i - 1);
      }),
    );
    const ws = words(li);
    ws.forEach((w) => delete w.dataset.said);
    if (typeof li.animate === "function") {
      li.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: i > 0 ? 160 : 0, easing: EASE, fill: "backwards" });
    }
    if (li.dataset.who === "agent") card.dataset.talking = "";
    ws.forEach((w, k) => later(() => (w.dataset.said = ""), FIRST_WORD + k * WORD_DELAY));
    const done = FIRST_WORD + ws.length * WORD_DELAY;
    later(() => delete card.dataset.talking, done);
    if (i < lines.length - 1) later(() => speak(i + 1), done + NEXT_LINE);
    else later(restart, done + RESTART_AFTER);
  }

  function restart() {
    flip(() =>
      lines.forEach((l) => {
        on(l, "on", false);
        on(l, "past", false);
      }),
    );
    later(() => speak(0), RESTART_DELAY);
  }

  return {
    update(should) {
      if (should && !running) {
        running = true;
        root.dataset.live = "";
        speak(idx < 0 || idx >= lines.length ? 0 : idx);
      } else if (!should && running) {
        running = false;
        clear();
        delete card.dataset.talking;
      }
    },
    showStatic,
    stop() {
      running = false;
      clear();
      delete card.dataset.talking;
    },
  };
}
