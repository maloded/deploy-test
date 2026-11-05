import { preload } from "react-dom";

/** hero.frame: the area fitted into the panel, in percent of the photo. */
export type HeroFrame = { left: number; right: number; top: number; bottom: number };
export type HeroLight = { x: number; y: number; size: number; aspect?: number; angle?: number };
/** The podium's geometry (hero.podium): see the schema. `text` is the engraving, already in the page language. */
export type PodiumLeds = { count: number; colour?: string; breathe: boolean; /** each light now and then brightens briefly and its glint flares (staggered) */ twinkle: boolean; /** seconds between the flares of one light, about (each light has its own, 0.75x to 1.25x) */ period: number };
export type Podium = { x: number; y: number; angle: number; ratio: number; scale: number; thickness: number; phoneScale?: number; phoneY?: number; /** where the contact shadow is centred (percent of the photo's height): under the tyres, whatever `y` is; default y */ shadowY?: number; text?: string; /** moves the lettering along the rim: percent of the oval's width, positive to the right */ textOffset?: number; leds?: PodiumLeds | null };

/** hero.podium.leds (true, false, settings or nothing) as complete settings, or null when the spots are off. */
export function ledsOf(setting: boolean | { count?: number; colour?: string; breathe?: boolean; twinkle?: boolean; period?: number } | undefined): PodiumLeds | null {
  if (!setting) return null;
  const o = setting === true ? {} : setting;
  return { count: o.count ?? 12, colour: o.colour, breathe: o.breathe === true, twinkle: o.twinkle !== false, period: o.period ?? 7 };
}

export const PODIUM_DEFAULTS: Podium = { x: 50, y: 100, angle: 0, ratio: 0.3, scale: 1.2, thickness: 3.5 };

/** hero.podium (true, false, a geometry object or nothing) as a complete geometry, or null when there is no podium. */
export function podiumOf(
  setting: boolean | (Omit<Partial<Podium>, "text" | "leds"> & { text?: string | Record<string, string | undefined>; leds?: boolean | { count?: number; colour?: string; breathe?: boolean; twinkle?: boolean; period?: number } }) | undefined,
  lang = "en",
): Podium | null {
  if (!setting) return null;
  if (setting === true) return { ...PODIUM_DEFAULTS };
  const { text, leds, ...geometry } = setting;
  const line = typeof text === "string" ? text : text ? (text[lang] ?? text.en ?? Object.values(text).find(Boolean)) : undefined;
  return { ...PODIUM_DEFAULTS, ...geometry, text: line || undefined, leds: ledsOf(leds) };
}

/** A tilted ellipse as a path (centre, half-width, half-height, the long axis tilted by `deg`): the shape turns, a gradient or a filter applied to it does not. */
function oval(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const t = (deg * Math.PI) / 180;
  const dx = rx * Math.cos(t);
  const dy = rx * Math.sin(t);
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M${f(cx + dx)} ${f(cy + dy)}A${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx - dx)} ${f(cy - dy)}A${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx + dx)} ${f(cy + dy)}Z`;
}

/**
 * The podium's side as a true extrusion of its top oval: the top ellipse's front half, a straight vertical line down at each extreme (where the silhouette is vertical, so the
 * outline is tangent there), and the same ellipse shifted down by `thick`, its front half. `wall` is that closed shape, `edge` the open outline (left side, bottom curve, right side).
 */
function extrusion(cx: number, cy: number, rx: number, ry: number, deg: number, thick: number): { wall: string; edge: string } {
  const t = (deg * Math.PI) / 180;
  const tR = Math.atan2(-ry * Math.sin(t), rx * Math.cos(t)); // the parameter where the tilted ellipse is farthest right (vertical tangent)
  const at = (a: number) => [cx + rx * Math.cos(a) * Math.cos(t) - ry * Math.sin(a) * Math.sin(t), cy + rx * Math.cos(a) * Math.sin(t) + ry * Math.sin(a) * Math.cos(t)];
  const [rX, rY] = at(tR);
  const [lX, lY] = at(tR + Math.PI);
  const f = (n: number) => Math.round(n * 100) / 100;
  const arc = (sweep: number, x: number, y: number) => `A${f(rx)} ${f(ry)} ${deg} 0 ${sweep} ${f(x)} ${f(y)}`;
  const down = `L${f(lX)} ${f(lY + thick)}${arc(0, rX, rY + thick)}`;
  return {
    wall: `M${f(rX)} ${f(rY)}${arc(1, lX, lY)}${down}Z`,
    edge: `M${f(lX)} ${f(lY)}${down.slice(0)}L${f(rX)} ${f(rY)}`,
  };
}

/**
 * The single hero's picture (hero.mode "single"): the cut-out van and, optionally, its podium (hero.podium) and the glowing lights (hero.lights), as ONE inline SVG.
 * The viewBox is the photo plus the room the podium needs, and the SVG is fitted into the panel as a whole (CSS: meet, anchored at the bottom), so the van stays on the
 * platform whatever the panel's shape and the lights' percentages are the photo's. The van is drawn from the same web image the page already has (an SVG <image> cannot use
 * next/image, so the file is preloaded here instead).
 *
 * The podium is the van's footprint seen from the camera's height: an oval under the van, its centre, tilt, flatness and size from the content (see Podium). Its top is
 * drawn first, then the contact shadow in the same tilt, then the van; the platform's rim is the top shifted down, so it shows on the near side only.
 */
export function HeroCar({ src, width, height, alt, podium, frame, phoneFrame, lights, emblem }: { src: string; width: number; height: number; alt: string; podium: Podium | null; frame?: HeroFrame; phoneFrame?: HeroFrame; lights: readonly HeroLight[]; emblem?: string | null }) {
  preload(src, { as: "image", fetchPriority: "high" });
  // with a frame for the one-screen layout and another for the rest, the picture is drawn twice and CSS shows one of them (an SVG's viewBox cannot change with the window)
  if (frame && phoneFrame) {
    return (
      <>
        <Picture className="hero__car hero__car--wide" id="w" align="xMidYMid" src={src} W={width} H={height} alt={alt} podium={podium} frame={frame} lights={lights} emblem={emblem} />
        <Picture className="hero__car hero__car--narrow" id="n" src={src} W={width} H={height} alt={alt} podium={podium && (podium.phoneScale || podium.phoneY !== undefined) ? { ...podium, scale: podium.phoneScale ?? podium.scale, y: podium.phoneY ?? podium.y, shadowY: podium.shadowY ?? podium.y } : podium} frame={phoneFrame} lights={lights} emblem={emblem} />
      </>
    );
  }
  return <Picture className="hero__car" id="" src={src} W={width} H={height} alt={alt} podium={podium} frame={frame ?? phoneFrame} lights={lights} emblem={emblem} />;
}

/** An emblem file's inline markup (already checked by the loader: plain shapes, markup built from what was read) as a viewBox and the shapes inside the root. */
function emblemParts(markup: string | null | undefined): { viewBox: string; inner: string } | null {
  if (!markup) return null;
  const open = /^<svg\b[^>]*>/.exec(markup)?.[0];
  const viewBox = open && /viewBox="([^"]+)"/.exec(open)?.[1];
  if (!open || !viewBox || !markup.endsWith("</svg>")) return null;
  return { viewBox, inner: markup.slice(open.length, -"</svg>".length) };
}

/**
 * The lettering (and the emblem before it) on the near rim: one `<text>` per letter, each on the rim's wall in the wall's own perspective (the letter's horizontal axis
 * follows the tilted ellipse's tangent, so it is foreshortened toward the sides; its vertical axis stays vertical). The emblem stands in the line at the same height as
 * the capitals and takes the same perspective. `layer` gives the classes (and the paint) of one of the three crisp layers of the raised letters: the fine shadow under them, the light top edge, the metal face.
 * The whole line is centred on the rim's front and moved along it by `offset` (a share of the oval's width).
 */
function engraving(geo: { cx: number; cy: number; rx: number; ry: number; thick: number }, text: string | undefined, emblem: { viewBox: string; inner: string } | null, offset: number, W: number, layer: { letter: string; emblem: string; dy: number; fill?: string; markFill?: string }) {
  const letters = [...(text ?? "").toLocaleUpperCase()];
  const k = geo.ry / geo.rx;
  const fs = geo.thick * 0.7;
  const cap = 0.7 * fs; // the capitals' height; the emblem has the same
  const step = fs * 0.95; // wide tracking: spaced capitals
  const lead = emblem ? cap + 0.55 * step + 0.35 * fs : 0; // the room of the emblem before the first letter
  const right = letters.length ? (letters.length - 1) * step + 0.45 * fs : 0;
  const left = emblem ? -(lead + 0.5 * step) + 0.5 * step - cap / 2 : -0.45 * fs; // the line's left end, relative to the first letter's centre
  const shift = -(left + right) / 2; // centre the line
  const u0 = Math.asin(Math.max(-0.9, Math.min(0.9, (2 * offset) / 100))); // moved along the rim (the ellipse's x is rx * sin u)
  const at = (a: number) => {
    const u = (a + shift) / geo.rx + u0;
    const x = geo.cx + geo.rx * Math.sin(u);
    const y = geo.cy + geo.ry * Math.cos(u) + geo.thick * 0.5 + 0.5 * cap + layer.dy;
    return { u, m: `matrix(${Math.cos(u).toFixed(4)} ${(-k * Math.sin(u)).toFixed(4)} 0 1 ${x.toFixed(2)} ${y.toFixed(2)})` };
  };
  const out = letters.flatMap((ch, i) => (ch === " " ? [] : [
    <text key={`t${i}`} className={layer.letter} fill={layer.fill} transform={at(i * step).m} fontSize={fs} textAnchor="middle">
      {ch}
    </text>,
  ]));
  if (emblem) {
    const e = at(-(0.5 * step + 0.35 * fs + cap / 2));
    out.unshift(
      <g key="emblem" className={layer.emblem} fill={layer.markFill} transform={e.m}>
        <svg x={-cap / 2} y={-cap} width={cap} height={cap} viewBox={emblem.viewBox} overflow="visible" dangerouslySetInnerHTML={{ __html: emblem.inner }} />
      </g>,
    );
  }
  return out;
}

/** How far out the spots sit on the top, as a share of the oval's radius: the whole spot (recess, ring) is well inside the edge, and the light round it is clipped to the top. */
const LED_INSET = 0.86;

/** The recessed spots: evenly spaced round the ground oval near its edge (angle u in the world: 0 is the front), flattened like the oval, smaller at the back (perspective). */
function ledPlaces(geo: { cx: number; cy: number; rx: number; ry: number }, count: number, W: number) {
  const k = geo.ry / geo.rx;
  return Array.from({ length: count }, (_, i) => {
    const u = ((i + 0.5) * 2 * Math.PI) / count; // a half step off the front, so that two spots flank the front centre
    const depth = 0.65 + 0.35 * ((1 + Math.cos(u)) / 2); // 1 at the front, 0.65 at the back
    return { x: geo.cx + geo.rx * LED_INSET * Math.sin(u), y: geo.cy + geo.ry * LED_INSET * Math.cos(u), r: 0.021 * W * depth, k, glint: Math.cos(u) > 0.2, i };
  });
}

function Picture({ className, id, align = "xMidYMax", src, W, H, alt, podium, frame, lights, emblem }: { className: string; id: string; align?: string; src: string; W: number; H: number; alt: string; podium: Podium | null; frame?: HeroFrame; lights: readonly HeroLight[]; emblem?: string | null }) {
  const sfx = id ? `-${id}` : "";
  const mark = emblemParts(emblem);
  const lettering = Boolean(podium?.text || mark);
  const margin = 0.012 * W;
  // the area fitted into the panel: hero.frame (the van keeps its place however the podium is tuned), else the photo with a hair of room; the van is never cut off and the podium widens it where it reaches beyond
  let box = frame ? { x0: Math.min(0, (frame.left / 100) * W), y0: Math.min(0, (frame.top / 100) * H), x1: Math.max(W, (frame.right / 100) * W), y1: Math.max(H, (frame.bottom / 100) * H) } : { x0: -0.01 * W, y0: -0.01 * H, x1: 1.01 * W, y1: 1.03 * H };
  let geo: { cx: number; cy: number; shadowCy: number; rx: number; ry: number; deg: number; thick: number; ex: number; ey: number } | null = null;
  if (podium) {
    const cx = (podium.x / 100) * W;
    const cy = (podium.y / 100) * H;
    const rx = (podium.scale * W) / 2;
    const ry = rx * podium.ratio;
    const t = (podium.angle * Math.PI) / 180;
    const ex = Math.hypot(rx * Math.cos(t), ry * Math.sin(t)); // the tilted oval's half-width and half-height
    const ey = Math.hypot(rx * Math.sin(t), ry * Math.cos(t));
    const thick = (podium.thickness / 100) * 2 * rx;
    geo = { cx, cy, shadowCy: ((podium.shadowY ?? podium.y) / 100) * H, rx, ry, deg: podium.angle, thick, ex, ey };
    box = { x0: Math.min(box.x0, cx - ex - margin), y0: Math.min(box.y0, cy - ey - margin), x1: Math.max(box.x1, cx + ex + margin), y1: Math.max(box.y1, cy + ey + thick + margin) };
  }
  const view = { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
  const wall = geo ? extrusion(geo.cx, geo.cy, geo.rx, geo.ry, geo.deg, geo.thick) : { wall: "", edge: "" };
  const raised = (dy: number, letter: string, emblemClass: string, fill?: string, markFill?: string) => (geo ? engraving(geo, podium?.text, mark, podium?.textOffset ?? 0, W, { letter, emblem: emblemClass, dy, fill, markFill }) : []);
  return (
    <svg className={className} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio={`${align} meet`} role="img" aria-label={alt}>
      <defs>
        {geo && (
          <radialGradient id={`hero-pod-top${sfx}`} gradientUnits="userSpaceOnUse" cx={geo.cx} cy={geo.cy - 0.25 * geo.ey} r={1.05 * Math.max(geo.ex, geo.ey)} fx={geo.cx} fy={geo.cy - 0.35 * geo.ey}>
            <stop offset="0" className="hero__pod-top-a" />
            <stop offset="0.6" className="hero__pod-top-b" />
            <stop offset="1" className="hero__pod-top-c" />
          </radialGradient>
        )}
        {lights.length > 0 && (
          <radialGradient id={`hero-light${sfx}`}>
            <stop offset="0" className="hero__light-a" />
            <stop offset="0.28" className="hero__light-b" />
            <stop offset="0.58" className="hero__light-c" />
            <stop offset="1" className="hero__light-d" />
          </radialGradient>
        )}
        {geo && podium?.leds && (
          <>
            <radialGradient id={`hero-led-pool${sfx}`}>
              <stop offset="0" className="hero__led-pool-a" />
              <stop offset="1" className="hero__led-pool-b" />
            </radialGradient>
            <radialGradient id={`hero-led-halo${sfx}`}>
              <stop offset="0" className="hero__led-halo-a" />
              <stop offset="1" className="hero__led-halo-b" />
            </radialGradient>
            <radialGradient id={`hero-led-glint${sfx}`}>
              <stop offset="0" className="hero__led-glint-a" />
              <stop offset="1" className="hero__led-glint-b" />
            </radialGradient>
            <radialGradient id={`hero-led-core${sfx}`}>
              <stop offset="0" className="hero__led-core-a" />
              <stop offset="1" className="hero__led-core-b" />
            </radialGradient>
          </>
        )}
        {geo && (
          <filter id={`hero-blur${sfx}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation={0.012 * W} />
          </filter>
        )}
        {geo && (
          <>
            <linearGradient id={`hero-pod-side${sfx}`} gradientUnits="userSpaceOnUse" x1={geo.cx - geo.ex} y1="0" x2={geo.cx + geo.ex} y2="0">
              <stop offset="0" className="hero__pod-side-a" />
              <stop offset="0.3" className="hero__pod-side-b" />
              <stop offset="0.72" className="hero__pod-side-b" />
              <stop offset="1" className="hero__pod-side-a" />
            </linearGradient>
            <clipPath id={`hero-pod-clip${sfx}`}>
              <ellipse cx={geo.cx} cy={geo.cy} rx={geo.rx} ry={geo.ry} />
            </clipPath>
          </>
        )}
        {geo && lettering && (
          <>
            <linearGradient id={`hero-metal${sfx}`} gradientUnits="userSpaceOnUse" x1="0" y1={-0.49 * geo.thick} x2="0" y2="0">
              <stop offset="0" className="hero__metal-a" />
              <stop offset="0.45" className="hero__metal-b" />
              <stop offset="1" className="hero__metal-c" />
            </linearGradient>
            <linearGradient id={`hero-metal-mark${sfx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="hero__metal-a" />
              <stop offset="0.45" className="hero__metal-b" />
              <stop offset="1" className="hero__metal-c" />
            </linearGradient>
          </>
        )}
        {geo && (
          <filter id={`hero-blur-wide${sfx}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation={0.03 * W} />
          </filter>
        )}
      </defs>
      {geo && (
        <g aria-hidden="true">
          <path className="hero__pod-drop" d={oval(geo.cx, geo.cy + geo.thick + 0.01 * W, geo.rx * 0.98, geo.ry * 0.98, geo.deg)} filter={`url(#hero-blur-wide${sfx})`} />
          <path className="hero__pod-side" d={wall.wall} fill={`url(#hero-pod-side${sfx})`} />
          <path className="hero__pod-side-edge" d={wall.edge} />
          <path className="hero__pod-top" d={oval(geo.cx, geo.cy, geo.rx, geo.ry, geo.deg)} fill={`url(#hero-pod-top${sfx})`} />
          {lettering && (
            <g className="hero__pod-engraving" transform={`rotate(${geo.deg} ${geo.cx} ${geo.cy})`}>
              {raised(0.0026 * W, "hero__pod-letter-shadow", "hero__pod-emblem hero__pod-emblem--shadow")}
              {raised(-0.0013 * W, "hero__pod-letter-top", "hero__pod-emblem hero__pod-emblem--top")}
              {raised(0, "hero__pod-letter", "hero__pod-emblem hero__pod-emblem--face", `url(#hero-metal${sfx})`, `url(#hero-metal-mark${sfx})`)}
            </g>
          )}
          {podium?.leds && (
            <g className="hero__leds hero__leds--pools" data-breathe={podium.leds.breathe ? "true" : undefined} style={podium.leds.colour ? ({ "--led": podium.leds.colour } as React.CSSProperties) : undefined} transform={`rotate(${geo.deg} ${geo.cx} ${geo.cy})`}>
              {ledPlaces(geo, podium.leds.count, W).map((l, i) => (
                <ellipse key={i} className="hero__led-pool" clipPath={`url(#hero-pod-clip${sfx})`} cx={l.x} cy={l.y} rx={l.r * 3} ry={l.r * 3 * l.k} fill={`url(#hero-led-pool${sfx})`} />
              ))}
            </g>
          )}
          {/* the contact shadow: the van's footprint, smaller than the platform and a little toward the van, in the same tilt */}
          <path className="hero__pod-contact" d={oval(geo.cx + 0.05 * geo.rx, geo.shadowCy + 0.05 * geo.ry, geo.rx * 0.6, geo.ry * 0.62, geo.deg)} filter={`url(#hero-blur${sfx})`} />
          {podium?.leds && (
            <g className="hero__leds hero__leds--spots" data-breathe={podium.leds.breathe ? "true" : undefined} style={podium.leds.colour ? ({ "--led": podium.leds.colour } as React.CSSProperties) : undefined} transform={`rotate(${geo.deg} ${geo.cx} ${geo.cy})`}>
              {ledPlaces(geo, podium.leds.count, W).map((l, i) => {
                // every light has its own rhythm (0.75x to 1.25x the period, spread by the golden ratio) and its own start, so that they never flare together
                const dur = podium.leds!.period * (0.75 + 0.5 * ((i * 0.618034) % 1));
                const delay = -dur * ((i * 0.381966 + 0.17) % 1);
                return (
                  <g key={i} className="hero__led" data-twinkle={podium.leds!.twinkle ? "true" : undefined} style={podium.leds!.twinkle ? ({ "--tw-dur": `${dur.toFixed(2)}s`, "--tw-delay": `${delay.toFixed(2)}s` } as React.CSSProperties) : undefined}>
                    <ellipse className="hero__led-halo" clipPath={`url(#hero-pod-clip${sfx})`} cx={l.x} cy={l.y} rx={l.r * 2.1} ry={l.r * 2.1 * l.k} fill={`url(#hero-led-halo${sfx})`} />
                    <ellipse className="hero__led-recess" cx={l.x} cy={l.y} rx={l.r * 1.15} ry={l.r * 1.15 * l.k} />
                    <ellipse className="hero__led-ring" cx={l.x} cy={l.y} rx={l.r} ry={l.r * l.k} strokeWidth={l.r * 0.07} />
                    <ellipse className="hero__led-core" cx={l.x} cy={l.y} rx={l.r * 0.58} ry={l.r * 0.58 * l.k} fill={`url(#hero-led-core${sfx})`} />
                    {l.glint && (
                      <>
                        <ellipse className="hero__led-glint" cx={l.x} cy={l.y} rx={l.r * 4.2} ry={l.r * 0.11} fill={`url(#hero-led-glint${sfx})`} />
                        <ellipse className="hero__led-glint" cx={l.x} cy={l.y} rx={l.r * 0.11} ry={l.r * 3.2} fill={`url(#hero-led-glint${sfx})`} />
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </g>
      )}
      <image href={src} x="0" y="0" width={W} height={H} />
      {lights.map((l, i) => {
        const lx = (l.x / 100) * W;
        const ly = (l.y / 100) * H;
        const lrx = ((l.size / 100) * W) / 2;
        return <ellipse key={i} className="hero__light" cx={lx} cy={ly} rx={lrx} ry={lrx / (l.aspect ?? 1)} transform={`rotate(${l.angle ?? 0} ${lx} ${ly})`} fill={`url(#hero-light${sfx})`} aria-hidden="true" />;
      })}
    </svg>
  );
}
