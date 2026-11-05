import { pick } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";
import type { Site } from "./blocks";
import { IntroHeading } from "./IntroHeading";

/** At least this many items in a track, so a track is always wider than the column it runs in (the items are repeated to get there). */
const MIN_ITEMS_PER_TRACK = 10;
/** Seconds for one pass over the list; the speed is the same however often it is repeated. */
const SECONDS_PER_LIST = 40;

/**
 * The invitation above the avatar card: a question ("Rather talk than read?") and a slow, endless running line of what the agent can do, as
 * plain text with separators (not chips). The texts come from the content (seller.json agent.avatar.intro; the heading falls back to the page
 * language's standard question).
 *
 * The line is two identical tracks back to back (CSS moves both left by exactly one track, linear, forever, so the start of the second follows the
 * end of the first with no gap and it never stops). Each track repeats the list until it is wider than the column. For a screen reader the list
 * exists once: the first pass of the first track; every repeat and the second track are aria-hidden. With reduced motion the CSS shows that first
 * pass as one static wrapped line.
 */
export function SofiaIntro({ site }: { site: Site }) {
  const intro = site.avatar?.intro;
  const { lang } = site;
  const heading = intro?.heading ? pick(intro.heading, lang) : ui("agent.intro.heading", lang);
  const items = (intro?.items ?? []).map((i) => pick(i, lang)).filter(Boolean);
  const repeats = items.length > 0 ? Math.ceil(MIN_ITEMS_PER_TRACK / items.length) : 0;
  const track = Array.from({ length: repeats }, (_, r) => items.map((t, i) => ({ t, key: `${r}-${i}`, repeat: r > 0 }))).flat();
  return (
    <div className="sofia-intro">
      <IntroHeading>{heading}</IntroHeading>
      {items.length > 0 && (
        <div className="sofia-intro__marquee">
          <div className="sofia-intro__rail" style={{ "--sofia-loop": `${SECONDS_PER_LIST * repeats}s` } as React.CSSProperties}>
            <ul className="sofia-intro__items" aria-label={ui("agent.intro.items", lang)}>
              {track.map((x) => (
                <li key={x.key} aria-hidden={x.repeat ? "true" : undefined}>
                  {x.t}
                </li>
              ))}
            </ul>
            <ul className="sofia-intro__items" aria-hidden="true">
              {track.map((x) => (
                <li key={x.key}>{x.t}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
