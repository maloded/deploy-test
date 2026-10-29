/**
 * A car wheel seen from the side, for the start button: tyre, sidewall edge, alloy rim with 5 twin-spokes, a brake-disc hint, and a
 * hub cap with 5 lug nuts. Plain shapes on a 64-unit grid (no stroke thinner than about 1 px at 1.5rem), no text, no brand mark.
 * Colours come from CSS (.avatar-card__wheel in globals.css). The turning group is the SVG's own; see "avatar-wheel-spin".
 */
const STEP = 72;
const AT = Array.from({ length: 5 }, (_, i) => i * STEP);

export function WheelIcon() {
  return (
    <svg className="avatar-card__wheel" viewBox="-32 -32 64 64" aria-hidden="true" focusable="false">
      <g className="avatar-card__wheel-turn">
        <circle r="30" className="wheel-tyre" />
        <circle r="28.2" className="wheel-side" />
        <circle r="23" className="wheel-rim" />
        <circle r="20.2" className="wheel-well" />
        <circle r="12.5" className="wheel-brake" />
        {AT.map((a) => (
          <g key={a} transform={`rotate(${a})`} className="wheel-rim">
            <polygon points="-3.9,-8 -0.1,-8 -2.5,-21.5 -6.3,-21.5" />
            <polygon points="3.9,-8 0.1,-8 2.5,-21.5 6.3,-21.5" />
          </g>
        ))}
        <circle r="7" className="wheel-hub" />
        {AT.map((a) => (
          <circle key={a} cx="0" cy="-4.2" r="1.35" className="wheel-lug" transform={`rotate(${a})`} />
        ))}
      </g>
    </svg>
  );
}
