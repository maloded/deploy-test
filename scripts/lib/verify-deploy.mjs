// Checks a running deployment (npm run verify:deploy -- <url> [--product <seller>/<product>] [--auth user:password]).
// Only fetch, no dependency. The parsing functions are pure (tests/verify-deploy.test.ts); `verifyDeploy` does the requests.

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

/** Whether an X-Robots-Tag header value contains noindex. */
export const hasNoindex = (value) => /\bnoindex\b/i.test(value ?? "");

/** The page text, entity-decoded and squashed, to look for a title in. */
export const pageText = (html) => squash(decodeEntities(html));

// ---- the checks ----------------------------------------------------------------------------------------------------

/**
 * @param {{ url: string, expected?: { title: string, displayName: string } | null, expectedProblem?: string, auth?: string, fetchImpl?: typeof fetch }} options
 * `expected` is read from the local content root by the command (title in the page language, seller's displayName).
 * @returns {Promise<{ name: string, ok: boolean, reason: string }[]>}
 */
export async function verifyDeploy({ url, expected = null, expectedProblem, auth, fetchImpl = fetch }) {
  const base = new URL(url);
  const results = [];
  const record = (name, ok, reason = "") => results.push({ name, ok, reason });
  const headers = (target) => (auth && new URL(target).origin === base.origin ? { authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {});
  const get = (target) => fetchImpl(target, { headers: headers(target), redirect: "follow" });
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
  record("X-Robots-Tag contains noindex", hasNoindex(robotsTag), hasNoindex(robotsTag) ? "" : `header is "${robotsTag ?? "(missing)"}"`);

  if (expected) {
    const found = pageText(html).includes(squash(expected.title));
    record("product title (page language) is in the HTML", found, found ? "" : "the title from the local product.json is not in the page");
  } else record("product title (page language) is in the HTML", false, expectedProblem ?? "no local product to compare with");

  const order = blockOrder(html);
  const ids = new Set(sectionIds(html));
  const missing = order.filter((id) => !ids.has(id));
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

  await guard("/robots.txt is 200 and disallows all", async () => {
    const r = await get(new URL("/robots.txt", base).href);
    const text = await r.text();
    record("/robots.txt is 200 and disallows all", r.status === 200 && robotsDisallowsAll(text), r.status !== 200 ? `status ${r.status}` : robotsDisallowsAll(text) ? "" : 'no "User-agent: *" with "Disallow: /"');
  });

  const footer = footerText(html);
  if (!expected) record("footer shows the seller's displayName", false, expectedProblem ?? "no local seller to compare with");
  else record("footer shows the seller's displayName", footer !== null && footer.includes(squash(expected.displayName)), footer === null ? "the page has no <footer>" : footer.includes(squash(expected.displayName)) ? "" : "the footer does not contain seller.displayName");
  return results;
}
