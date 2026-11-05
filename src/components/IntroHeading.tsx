/**
 * The invitation's question above the agent's card. On a wide window it stays on ONE line whatever the language or the font: if its text is wider than the
 * column, the size scales down (--intro-scale, 0.75 at the least, set by the hero's fit, see lib/hero-fit.ts and .hero__aside .sofia-intro__heading) and, only beyond
 * that, the CSS ends it with an ellipsis. It must never wrap: the block grows upward from the card, so a second line would slide under the header. On a phone it is a normal wrapping line.
 */
export function IntroHeading({ children }: { children: string }) {
  return <p className="sofia-intro__heading">{children}</p>;
}
