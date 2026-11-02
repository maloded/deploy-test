// The seller's optional logo (seller.json "logo": the name of an SVG file next to seller.json). Pure checks and the markup
// the header inlines; no file access here (the loader reads the file). It is inlined, not an <img>, so `currentColor` in the
// SVG takes the text colour of the theme and the mark works in both. No logo is invented: without the field the header shows the name only.
//
// The file ends up inside the page, so it is not "cleaned" but ALLOWED: a small tokenizer accepts only well-formed elements from a
// short list of drawing shapes, only attributes from a short list, only quoted values with no entity, no link and no style, and
// text only as white space. Anything else (a script, an event handler, <style>, <a>, <use>, an unquoted attribute, an odd comment,
// a doctype) makes the file invalid and the build stops with the reason. A denylist of dangerous words is not used: it can be
// walked around (for example by a comment that a browser reads differently from a regex).

/** A plain file name inside the seller's folder, an SVG. */
export const LOGO_FILE = /^[^/\\]+\.svg$/i;
export const LOGO_FILE_MESSAGE = 'must be the name of an SVG file next to seller.json, for example "logo.svg"';
/** A logo is a small mark, not an illustration. */
export const MAX_LOGO_BYTES = 32 * 1024;

/** The drawing elements a logo may use (canonical case; matched without regard to case). */
const ELEMENTS = ["svg", "g", "defs", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "linearGradient", "radialGradient", "stop", "mask", "clipPath"];
/** The attributes a logo may use. No href, style, class, on* or anything that loads or runs. */
const ATTRIBUTES = [
  "xmlns", "viewBox", "preserveAspectRatio", "width", "height", "id", "transform",
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "points", "pathLength",
  "fill", "fill-rule", "fill-opacity", "clip-rule", "opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "fx", "fy", "spreadMethod", "maskUnits", "maskContentUnits", "clipPathUnits", "mask", "clip-path", "color",
];
const canonical = (names: string[]) => new Map(names.map((n) => [n.toLowerCase(), n]));
const ELEMENT = canonical(ELEMENTS);
const ATTRIBUTE = canonical(ATTRIBUTES);

// White space is the HTML set only (tab, line feed, form feed, carriage return, space): a JavaScript \s also matches characters
// (no-break space, line separator, ...) that an HTML parser does not treat as white space, and the two would read a tag differently.
const WS = "[\\t\\n\\f\\r ]";
const NAME = "[A-Za-z][A-Za-z0-9:.-]*";
const TAG = new RegExp(`<(/?)(${NAME})((?:${WS}+${NAME}${WS}*=${WS}*(?:"[^"<>]*"|'[^'<>]*'))*)${WS}*(/?)>`, "y");
const ATTR = new RegExp(`(${NAME})${WS}*=${WS}*(?:"([^"<>]*)"|'([^'<>]*)')`, "g");
/** What may stand before the root: an XML prolog and ordinary comments (no "--" inside and not the abrupt "<!-->" forms, so no browser reads them differently from this check). */
const LEAD = new RegExp(`^(?:${WS}+|<\\?xml\\b[^<>]*\\?>|<!--(?!>|->)(?:(?!--)[\\s\\S])*-->)+`);
/** Printable ASCII and the HTML white space; any other character (control, no-break space, line separator, byte order mark, non-ASCII) is refused. */
const UNSUPPORTED = /[^\t\n\f\r\x20-\x7E]/;

const lead = (svg: string) => LEAD.exec(svg)?.[0] ?? "";
const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Parsed = { ok: true; markup: string } | { ok: false; problem: string };

/**
 * Reads the file token by token. The markup it returns is BUILT from what was read (allowed names, attributes as name="value" with
 * the value escaped), never the file's own text, so nothing a parser could read differently survives into the page.
 */
function parseLogo(svg: string, bytes: number): Parsed {
  const fail = (problem: string): Parsed => ({ ok: false, problem });
  if (bytes > MAX_LOGO_BYTES) return fail(`is ${Math.round(bytes / 1024)} KB; a logo may be at most ${MAX_LOGO_BYTES / 1024} KB`);
  if (UNSUPPORTED.test(svg)) return fail("contains a character other than plain ASCII (a no-break space, a byte order mark or a non-ASCII letter, for example); save it as plain ASCII");
  const body = svg.slice(lead(svg).length).trimEnd();
  const stack: string[] = [];
  let out = "";
  let i = 0;
  let roots = 0;
  while (i < body.length) {
    if (body[i] !== "<") {
      const end = body.indexOf("<", i);
      const text = body.slice(i, end < 0 ? body.length : end);
      if (text.replace(new RegExp(WS, "g"), "")) return fail("contains text; a logo is shapes only");
      i += text.length;
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(body);
    if (!m) return fail(`contains markup that is not a plain SVG element at character ${i} (a script, <style>, a doctype, a stray comment, an unquoted attribute and the like are not allowed)`);
    const [whole, closing, rawName, attrs, selfClosing] = m;
    const name = ELEMENT.get(rawName.toLowerCase());
    if (!name) return fail(`uses <${rawName}>, which a logo may not (allowed: ${ELEMENTS.join(", ")})`);
    if (closing) {
      if (attrs.trim() || selfClosing || stack.pop() !== name) return fail(`has a closing tag </${rawName}> that does not match`);
      out += `</${name}>`;
    } else {
      if (stack.length === 0) {
        roots++;
        if (name !== "svg" || roots > 1) return fail("must be one <svg> element");
      }
      let tag = `<${name}`;
      if (stack.length === 0) tag += ' aria-hidden="true" focusable="false"'; // decorative: the name is next to it
      const seen = new Set<string>();
      for (const a of attrs.matchAll(ATTR)) {
        const attr = ATTRIBUTE.get(a[1].toLowerCase());
        const value = a[2] ?? a[3];
        if (!attr) return fail(`uses the attribute "${a[1]}", which a logo may not`);
        if (seen.has(attr)) return fail(`has the attribute "${a[1]}" twice`);
        seen.add(attr);
        if (/&|javascript:|data:|url\(\s*(?!#)/i.test(value)) return fail(`has a value for "${a[1]}" that is an entity, a script or points to another file (only url(#id) is allowed)`);
        tag += ` ${attr}="${escapeAttr(value)}"`;
      }
      out += tag + (selfClosing ? "/>" : ">");
      if (!selfClosing) stack.push(name);
    }
    i += whole.length;
  }
  if (roots !== 1 || stack.length > 0) return fail("is not one complete <svg> element");
  return { ok: true, markup: out };
}

/** Why a logo file may not be used, or null. */
export function logoProblem(svg: string, bytes: number = new TextEncoder().encode(svg).length): string | null {
  const r = parseLogo(svg, bytes);
  return r.ok ? null : r.problem;
}

/** The markup the header inlines: built from the parsed file (see parseLogo), hidden from assistive technology. Throws for a file logoProblem refuses. */
export function logoMarkup(svg: string): string {
  const r = parseLogo(svg, new TextEncoder().encode(svg).length);
  if (!r.ok) throw new Error(`The logo ${r.problem}`);
  return r.markup;
}
