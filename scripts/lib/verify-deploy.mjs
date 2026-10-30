// Checks a running deployment (npm run verify:deploy -- <url> [--product <seller>/<product>] [--expect-template <hash>] [--release]).
// Only fetch, no dependency. The parsing functions are pure (tests/verify-deploy.test.ts); `verifyDeploy` does the requests.

import { cleanVersionInfo, versionLine } from "../../src/lib/version.ts";

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "­", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  copy: "©", euro: "€", szlig: "ß", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", eacute: "é", egrave: "è", agrave: "à", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ccedil: "ç", ntilde: "ñ" };

/** Decodes the HTML entities that appear in text and attribute values (named, decimal and hexadecimal). */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const key = [body, body.toLowerCase()].find((k) => Object.hasOwn(NAMED, k));
    return key ? NAMED[key] : whole;
  });
}

/** Whitespace of every kind (no-break and narrow spaces included) collapsed to one plain space, so two texts compare. */
export const squash = (text) => text.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** The value of an attribute inside one tag's text, or null. */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : null;
}

/** The lang attribute of <html>, or null. */
export function htmlLang(html) {
  const tag = /<html\b[^>]*>/i.exec(html);
  return tag ? attr(tag[0], "lang") : null;
}

/** The ids in data-block-order (page order); empty when the attribute is missing. */
export function blockOrder(html) {
  const m = /\sdata-block-order\s*=\s*"([^"]*)"/i.exec(html);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/**
 * Whether the page has an element with id="contact" (the footer's contact row), that element holds no form field, and
 * it holds the seller's mailto link. The form exists only in the dialog, which the browser adds after the page has
 * loaded, so the static HTML has the row with its links, never a form.
 */
export function contactRow(html) {
  const open = [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi)].find((m) => attr(m[0], "id") === "contact");
  if (!open) return false;
  const tag = open[1].toLowerCase();
  let depth = 1;
  let end = html.length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = open.index + open[0].length;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      end = m.index;
      break;
    }
  }
  const body = html.slice(open.index, end);
  return !/<(form|input|select|textarea)\b/i.test(body) && /<a\b[^>]*\shref\s*=\s*["']mailto:/i.test(body);
}

/** The ids of all <section> elements. */
export function sectionIds(html) {
  return [...html.matchAll(/<section\b[^>]*>/gi)].map((m) => attr(m[0], "id")).filter(Boolean);
}

/** For every <img>: its src and the first URL of its srcset (both entity-decoded, as written, not resolved). */
export function imageRefs(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => {
    const srcset = attr(m[0], "srcset");
    return { src: attr(m[0], "src"), srcsetFirst: srcset ? srcset.trim().split(/\s+/)[0] : null };
  });
}

/** The text of the first <footer>, tags removed, entities decoded, whitespace squashed; null without a footer. */
export function footerText(html) {
  const m = /<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(html);
  return m ? squash(decodeEntities(m[1].replace(/<[^>]*>/g, " "))) : null;
}

/** The <link rel="alternate" hreflang="..." href="..."> tags: [{ hreflang, href }]. */
export function hreflangLinks(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter((m) => attr(m[0], "rel")?.toLowerCase() === "alternate" && attr(m[0], "hreflang"))
    .map((m) => ({ hreflang: attr(m[0], "hreflang"), href: attr(m[0], "href") }));
}

/** The href of <link rel="canonical">, or null. */
export function canonicalHref(html) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)].find((m) => attr(m[0], "rel")?.toLowerCase() === "canonical");
  return tag ? attr(tag[0], "href") : null;
}

/** Whether robots.txt says "User-agent: *" followed by "Disallow: /". */
export function robotsDisallowsAll(text) {
  let applies = false;
  let sawAgentLine = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!sawAgentLine) applies = false; // a new group starts
      sawAgentLine = true;
      if (m[2].trim() === "*") applies = true;
    } else {
      sawAgentLine = false;
      if (applies && key === "disallow" && m[2].trim() === "/") return true;
    }
  }
  return false;
}

/** Whether robots.txt allows crawling: it has no "Disallow: /" for "User-agent: *" (an empty text, which allows everything, counts). */
export const robotsAllowsAll = (text) => !robotsDisallowsAll(text);

/** Whether the page has a <meta name="robots"> whose content contains noindex. */
export function hasMetaNoindex(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some((m) => (attr(m[0], "name") ?? "").toLowerCase() === "robots" && hasNoindex(attr(m[0], "content")));
}

/** Whether the page carries the "Prototype" note of NEXT_PUBLIC_PROTOTYPE_NOTE (the footer line, or its version line). */
export const hasPrototypeNote = (html) => /class="[^"]*\bsite-footer__(prototype|version)\b/.test(html);

/** Whether the page carries the review theme switcher (REVIEW_THEME_SWITCHER=1). */
export const hasThemeSwitcher = (html) => /class="[^"]*\btheme-switcher\b/.test(html);

/** Whether an X-Robots-Tag header value contains noindex. */
export const hasNoindex = (value) => /\bnoindex\b/i.test(value ?? "");

/** The content of every <meta name=... or property=...> tag, by that key (the first one wins). */
export function metaTags(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attr(m[0], "property") ?? attr(m[0], "name");
    const content = attr(m[0], "content");
    if (key && content !== null && !(key in out)) out[key] = content;
  }
  return out;
}

/** The text of every <script type="application/ld+json"> in the page. */
export function jsonLdScripts(html) {
  return [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

/** The width and height of a JPEG (from its start-of-frame marker), or null when the bytes are not a JPEG. No dependency. */
export function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

/** The product types that ship with a schemaType (src/product-types/<type>/fields.ts): their pages must carry structured data in a release. */
export const JSON_LD_TYPES = ["car", "house", "watch", "bag"];

/** The page text, entity-decoded and squashed, to look for a title in. */
export const pageText = (html) => squash(decodeEntities(html));

// ---- the checks ----------------------------------------------------------------------------------------------------

/**
 * @param {{ url: string, release?: boolean, expectTemplate?: string, expected?: { title: string, displayName: string, languages?: string[], defaultLanguage?: string, titles?: Record<string, string>, productType?: string, price?: { amount: number, currency: string }, hasGallery?: boolean } | null, expectedProblem?: string, fetchImpl?: typeof fetch }} options
 * `expected` is read from the local content root by the command (title in the default language, seller's displayName;
 * and the seller's languages, default language and the title per language). With `languages` and `defaultLanguage`
 * the language routes are checked too: "/" redirects to "/<default>", every "/<lang>" is a page in that language, and each has the footer's contact row.
 * `expectTemplate`: the short hash of the template commit the deployment must have been built from (see /version.json).
 * @returns {Promise<{ name: string, ok: boolean, reason: string, level?: "info" | "warn" }[]>} `level` marks the version line: "info" prints it, "warn" is "version unknown" (a warning, not a failure)
 */
export async function verifyDeploy({ url, expected = null, expectedProblem, expectTemplate, release = false, fetchImpl = fetch }) {
  const base = new URL(url);
  const results = [];
  const record = (name, ok, reason = "") => results.push({ name, ok, reason });
  const get = (target) => fetchImpl(target, { redirect: "follow" });
  const getManual = (target) => fetchImpl(target, { redirect: "manual" });
  const guard = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      record(name, false, `request failed: ${e?.cause?.code ?? e?.message ?? e}`);
    }
  };

  let html = "";
  let res = null;
  await guard("GET / is 200 and HTML", async () => {
    res = await get(base.href);
    const type = res.headers.get("content-type") ?? "";
    html = await res.text();
    record("GET / is 200 and HTML", res.status === 200 && /text\/html/i.test(type), res.status !== 200 ? `status ${res.status}` : /text\/html/i.test(type) ? "" : `content-type is "${type}"`);
  });
  if (!res) return results;

  const lang = htmlLang(html);
  record("html lang attribute present", Boolean(lang), lang ? "" : "<html> has no lang attribute");
  const robotsTag = res.headers.get("x-robots-tag");
  if (release) {
    // a release: indexing is allowed (SITE_INDEXABLE=1 at build), nothing of the review is left
    record("indexing allowed: no noindex in X-Robots-Tag", !hasNoindex(robotsTag), hasNoindex(robotsTag) ? `header is "${robotsTag}"` : "");
    record("indexing allowed: no noindex meta tag", !hasMetaNoindex(html), hasMetaNoindex(html) ? "the page has <meta name=robots content=noindex>: was SITE_INDEXABLE=1 set for the BUILD?" : "");
    record("no prototype note in the page", !hasPrototypeNote(html), hasPrototypeNote(html) ? "the footer carries the prototype note: NEXT_PUBLIC_PROTOTYPE_NOTE must be unset for the build" : "");
    record("no review theme switcher in the page", !hasThemeSwitcher(html), hasThemeSwitcher(html) ? "the page has the theme switcher: REVIEW_THEME_SWITCHER must be unset" : "");
  } else record("X-Robots-Tag contains noindex", hasNoindex(robotsTag), hasNoindex(robotsTag) ? "" : `header is "${robotsTag ?? "(missing)"}"`);

  if (expected) {
    const found = pageText(html).includes(squash(expected.title));
    record("product title (page language) is in the HTML", found, found ? "" : "the title from the local product.json is not in the page");
  } else record("product title (page language) is in the HTML", false, expectedProblem ?? "no local product to compare with");

  const order = blockOrder(html);
  const ids = new Set(sectionIds(html));
  // "contact" is the footer's contact row, not a <section>: it has its own check below
  const missing = order.filter((id) => id !== "contact" && !ids.has(id));
  record("every block in data-block-order has a <section>", order.length > 0 && missing.length === 0, order.length === 0 ? "data-block-order is missing or empty" : missing.length ? `no <section id> for: ${missing.join(", ")}` : "");

  const urls = new Set();
  for (const { src, srcsetFirst } of imageRefs(html)) for (const u of [src, srcsetFirst]) if (u) urls.add(new URL(u, base).href);
  const bad = [];
  for (const target of urls) {
    try {
      const r = await get(target);
      await r.arrayBuffer();
      const type = r.headers.get("content-type") ?? "";
      if (r.status !== 200 || !/^image\//i.test(type)) bad.push(`${new URL(target).pathname} (${r.status}${r.status === 200 ? `, ${type || "no content-type"}` : ""})`);
    } catch (e) {
      bad.push(`${new URL(target).pathname} (${e?.cause?.code ?? e?.message})`);
    }
  }
  record(`every <img> src and srcset URL is 200 with an image type (${urls.size} URLs)`, urls.size > 0 && bad.length === 0, urls.size === 0 ? "the page has no images" : bad.slice(0, 3).join("; ") + (bad.length > 3 ? ` and ${bad.length - 3} more` : ""));

  const robotsName = release ? "/robots.txt is 200 and allows crawling" : "/robots.txt is 200 and disallows all";
  await guard(robotsName, async () => {
    const r = await get(new URL("/robots.txt", base).href);
    const text = await r.text();
    if (release) record(robotsName, r.status === 200 && robotsAllowsAll(text), r.status !== 200 ? `status ${r.status}` : robotsAllowsAll(text) ? "" : 'robots.txt still has "User-agent: *" with "Disallow: /"');
    else record(robotsName, r.status === 200 && robotsDisallowsAll(text), r.status !== 200 ? `status ${r.status}` : robotsDisallowsAll(text) ? "" : 'no "User-agent: *" with "Disallow: /"');
  });

  const footer = footerText(html);
  if (!expected) record("footer shows the seller's displayName", false, expectedProblem ?? "no local seller to compare with");
  else record("footer shows the seller's displayName", footer !== null && footer.includes(squash(expected.displayName)), footer === null ? "the page has no <footer>" : footer.includes(squash(expected.displayName)) ? "" : "the footer does not contain seller.displayName");

  if (expected?.languages?.length && expected.defaultLanguage) await verifyLanguages({ base, expected, get, getManual, record, guard });
  if (release) {
    await verifyNoVersion({ base, get, record, guard });
    await verifyRelease({ base, html, expected, get, record, guard });
  }
  else await verifyVersion({ base, get, expectTemplate, results });
  return results;
}

/** The language routes: "/" redirects to "/<default>", and every "/<lang>" answers in its own language. */
async function verifyLanguages({ base, expected, get, getManual, record, guard }) {
  const { languages, defaultLanguage, titles = {} } = expected;
  const redirectName = `"/" redirects to "/${defaultLanguage}"`;
  await guard(redirectName, async () => {
    const r = await getManual(new URL("/", base).href);
    await r.arrayBuffer();
    const location = r.headers.get("location");
    const target = location ? new URL(location, base) : null;
    const ok = [301, 302, 303, 307, 308].includes(r.status) && target !== null && target.pathname === `/${defaultLanguage}`;
    record(redirectName, ok, ok ? "" : r.status < 300 || r.status > 399 ? `status ${r.status} (no redirect)` : `redirects to ${target ? target.pathname : "(no location)"}`);
  });

  const noContact = [];
  for (const lang of languages) {
    const name = `GET /${lang} is 200, html lang is "${lang}", hreflang links present`;
    await guard(name, async () => {
      const r = await get(new URL(`/${lang}`, base).href);
      const html = await r.text();
      if (r.status === 200 && !contactRow(html)) noContact.push(lang);
      const problems = [];
      if (r.status !== 200) problems.push(`status ${r.status}`);
      else {
        const found = htmlLang(html);
        if (found !== lang) problems.push(`html lang is ${found ? `"${found}"` : "missing"}`);
        const links = hreflangLinks(html);
        const missing = [...languages, "x-default"].filter((l) => !links.some((k) => k.hreflang.toLowerCase() === l.toLowerCase()));
        if (missing.length) problems.push(`no hreflang link for: ${missing.join(", ")}`);
        const canonical = canonicalHref(html);
        if (!canonical) problems.push("no canonical link");
        else if (new URL(canonical, base).pathname !== `/${lang}`) problems.push(`canonical is ${new URL(canonical, base).pathname}`);
        if (titles[lang] && !pageText(html).includes(squash(titles[lang]))) problems.push("the title in this language is not in the page");
      }
      record(name, problems.length === 0, problems.join("; "));
    });
  }

  const contactName = "the contact row (#contact) exists on every language route, holds no form and has the e-mail link";
  record(contactName, noContact.length === 0 && languages.length > 0, noContact.length ? `no form-free #contact with the e-mail link on: ${noContact.map((l) => `/${l}`).join(", ")}` : "");
}

/**
 * What a release publishes for search and sharing (only with --release, so a demo never needs SITE_URL): absolute canonical and hreflang URLs on
 * this site's own origin, the Open Graph image (a 1200x630 JPEG that answers 200) and Twitter card, /sitemap.xml with both languages and alternates
 * and its line in robots.txt, and structured data whose price is the content's price and which cannot close its script tag.
 */
async function verifyRelease({ base, html, expected, get, record, guard }) {
  const origin = base.origin;
  const isAbsolute = (u) => /^https?:\/\//i.test(u ?? "");
  const own = (u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  };

  const canonical = canonicalHref(html);
  const canonicalOk = isAbsolute(canonical) && own(canonical);
  record("canonical link is absolute and on this site", canonicalOk, canonicalOk ? "" : !canonical ? "no canonical link" : !isAbsolute(canonical) ? `canonical is "${canonical}": SITE_URL was not set for the build` : `canonical is ${canonical}, not on ${origin}: is SITE_URL this site's origin?`);
  const alternates = hreflangLinks(html);
  const badAlt = alternates.filter((a) => !isAbsolute(a.href) || !own(a.href)).map((a) => `${a.hreflang}=${a.href}`);
  record("hreflang links are absolute and on this site", alternates.length > 0 && badAlt.length === 0, alternates.length === 0 ? "no hreflang links" : badAlt.join("; "));

  const meta = metaTags(html);
  record("Open Graph title and locale present", Boolean(meta["og:title"] && meta["og:locale"]), `og:title ${meta["og:title"] ? "ok" : "missing"}, og:locale ${meta["og:locale"] ? "ok" : "missing"}`.replace(/^og:title ok, og:locale ok$/, ""));
  const image = meta["og:image"];
  if (!image) {
    // a product with a gallery photo has one (unless the photo is smaller than 1200x630, which `npm run images` warned about)
    record("og:image is a 1200x630 JPEG that answers 200", !expected?.hasGallery, expected?.hasGallery ? "no og:image although the product has a gallery photo (is the first photo at least 1200x630? was `npm run images` run before the build?)" : "");
    record("twitter:card matches the image", meta["twitter:card"] === "summary", `twitter:card is "${meta["twitter:card"] ?? "(missing)"}", expected "summary" (no image)`.replace(/^twitter:card is "summary", expected "summary" \(no image\)$/, ""));
  } else {
    const name = "og:image is a 1200x630 JPEG that answers 200";
    await guard(name, async () => {
      if (!isAbsolute(image) || !own(image)) return record(name, false, `og:image is "${image}" (absolute and on this site expected)`);
      const r = await get(image);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const size = jpegSize(bytes);
      const ok = r.status === 200 && /image\/jpeg/i.test(r.headers.get("content-type") ?? "") && size?.width === 1200 && size?.height === 630;
      record(name, ok, ok ? "" : r.status !== 200 ? `status ${r.status}` : !size ? "not a JPEG" : `${size.width}x${size.height}`);
    });
    record("twitter:card is summary_large_image", meta["twitter:card"] === "summary_large_image", `twitter:card is "${meta["twitter:card"] ?? "(missing)"}"`.replace(/^twitter:card is "summary_large_image"$/, ""));
    record("og:image has an alt text", Boolean(meta["og:image:alt"]), "no og:image:alt");
  }

  const sitemapName = "/sitemap.xml lists every language page with its alternates, and robots.txt names it";
  await guard(sitemapName, async () => {
    const r = await get(new URL("/sitemap.xml", base).href);
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const problems = [];
    if (r.status !== 200) problems.push(`status ${r.status}`);
    else {
      if (!/xml/i.test(r.headers.get("content-type") ?? "")) problems.push(`content-type is "${r.headers.get("content-type")}"`);
      if (locs.length === 0) problems.push("no <loc>");
      if (locs.some((l) => !own(l))) problems.push("a <loc> is not on this site");
      for (const lang of expected?.languages ?? []) if (!locs.includes(`${origin}/${lang}`)) problems.push(`no ${origin}/${lang}`);
      if ((expected?.languages?.length ?? 0) > 1 && !/hreflang="x-default"/.test(xml)) problems.push("no hreflang alternates");
    }
    const robots = await (await get(new URL("/robots.txt", base).href)).text();
    if (!new RegExp(`^Sitemap:\\s*${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml\\s*$`, "im").test(robots)) problems.push(`robots.txt has no "Sitemap: ${origin}/sitemap.xml" line`);
    record(sitemapName, problems.length === 0, problems.join("; "));
  });

  const ldName = "structured data (JSON-LD) is valid, carries the content's price and cannot close its script";
  const scripts = jsonLdScripts(html);
  const wanted = expected?.productType ? JSON_LD_TYPES.includes(expected.productType) : true;
  if (scripts.length === 0) record(ldName, !wanted, wanted ? "no JSON-LD script in the page" : "");
  else {
    const problems = [];
    if (scripts.length > 1) problems.push(`${scripts.length} JSON-LD scripts`);
    const text = scripts[0];
    if (/[<>]/.test(text)) problems.push("raw < or > inside the script (not escaped)");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      problems.push("not valid JSON");
    }
    if (data) {
      if (data["@context"] !== "https://schema.org") problems.push("@context is not https://schema.org");
      if (typeof data["@type"] !== "string" || !data["@type"]) problems.push("no @type");
      if (!data.name) problems.push("no name");
      const spec = data.offers?.priceSpecification ?? data.offers;
      if (expected?.price) {
        if (Number(spec?.price) !== expected.price.amount) problems.push(`price ${spec?.price} is not the content's ${expected.price.amount}`);
        if (spec?.priceCurrency !== expected.price.currency) problems.push(`currency ${spec?.priceCurrency} is not the content's ${expected.price.currency}`);
      }
    }
    record(ldName, problems.length === 0, problems.join("; "));
  }
}

/** A release serves no /version.json (it answers 404 unless NEXT_PUBLIC_PROTOTYPE_NOTE is set). */
async function verifyNoVersion({ base, get, record, guard }) {
  const name = "no /version.json (404)";
  await guard(name, async () => {
    const r = await get(new URL("/version.json", base).href);
    await r.arrayBuffer();
    record(name, r.status === 404, r.status === 404 ? "" : `status ${r.status}: the build exposes its version`);
  });
}

/** The deployed version, read from /version.json. Without the file: "version unknown", a warning (a failure only when a template hash was expected). */
async function verifyVersion({ base, get, expectTemplate, results }) {
  const name = "deployed version (/version.json)";
  let info = null;
  try {
    const r = await get(new URL("/version.json", base).href);
    if (r.status === 200) info = cleanVersionInfo(await r.json());
  } catch {
    // no file, no JSON: unknown
  }
  if (!info) {
    results.push(expectTemplate ? { name, ok: false, reason: `version unknown, cannot compare with --expect-template ${expectTemplate}` } : { name, ok: true, reason: "version unknown", level: "warn" });
    return;
  }
  const line = versionLine(info);
  if (expectTemplate && info.template !== expectTemplate) results.push({ name, ok: false, reason: `template is ${info.template ?? "unknown"}, expected ${expectTemplate} (${line})` });
  else results.push({ name, ok: true, reason: line, level: expectTemplate ? undefined : "info" });
}
