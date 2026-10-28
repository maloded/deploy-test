# DEPLOY: private review demo on Vercel

This is for a **temporary, password-protected review**, not for a public release. Everything here assumes the
demo snapshot repository (see "Make the snapshot"), never the working repository.

## Make the snapshot

```
npm run snapshot -- --product <seller>/<product> --out <folder>             # one commit "Demo snapshot" in a new folder outside the repository
npm run snapshot -- --product <seller>/<product> --out <folder> --replace   # rebuild it (only a folder whose last commit is "Demo snapshot")
```

To change the data of a deploy repository that already exists (made by the command above), update it instead of rebuilding it:

```
npm run snapshot -- --product <seller>/<product> --out <existing folder> --update
```

The folder must be a git repository whose commits are only "Demo snapshot" or "Update: ..." ones (anything else is refused, and so is a folder with uncommitted changes). Its working tree (everything except `.git`) is replaced by the new snapshot and ONE new commit "Update: <changed paths>" is put on top of the existing history; nothing is pushed and nothing is force-pushed. The command prints the changed paths, the **template paths changed outside `content/`** (their count is 0 when only the data changed; anything else means template files differ from the last snapshot) and the exact `git push` command for you to run. A snapshot holds one product, so updating with another product replaces the first one in the deployed folder.

The snapshot carries no `.github/` (no CI workflow): the deployment repository is built by the host, and the workflow tests the examples, not the product, so it would only spend Actions minutes and fail on billing problems. `export:template` keeps `.github/`, because the template repository needs it. A deploy repository made before this change still has the workflow files; the first `--update` removes them, and they are then the only "template paths changed (outside content/)" it lists (a count of exactly the `.github` files).

`--out` is required (there is no default folder). What it does: runs `npm run images:export` for that one product (only the files `product.json` uses go to `<content root>/<seller>/<product>/media-web/`,
processed: long side 2000 px, quality about 80, rotation applied, EXIF and GPS removed; unused photos are listed as
"skipped (not used)"); exports the **tracked files of the current commit** (uncommitted changes are not included), without the
development notes (`PROJECT.md`, `PROGRESS.md`, `docs/`; `README.md` and this file are kept);
adds only that product (`<content root>/<seller>/<product>`, never its `media/` originals) and its seller's `seller.json`, plus `examples/` and `tests/fixtures`, and nothing else from the content root (no other seller, no other product of the seller); refuses to continue if the tree contains an original photo, `.env*`, `data/leads`,
`node_modules` or an image that still has EXIF; prints the file list and total size; makes one commit in a new
repository. It never adds a remote and never pushes. The history of the working repository is not copied.

Then, in the snapshot folder, add the private remote yourself and push:

```
cd <folder>
git remote add origin <ssh-url-of-the-new-private-repository>
git push -u origin main
```

## Import in Vercel

1. Vercel: **Add New... > Project**, import the snapshot repository (private).
2. Framework preset: **Next.js** (detected). Node.js version: `package.json` pins `"engines": { "node": "22.x" }`.
   Vercel's documentation (supported Node.js versions, last updated 2026-02-27) lists only major versions, **24.x
   (default)** and **22.x**; it deploys the latest 22.x for `22.x` and the latest 24.x for an open range such as `>=22`,
   which is why a major is pinned. The scripts need a Node that strips TypeScript types by default (22.18 or newer). Vercel's
   documentation does not state which 22.x minor it runs (it rolls minors out itself), so whether it is already 22.18 or
   newer is not verified here; if a build ever stops with "needs a Node.js that runs TypeScript files", select Node 24.x in the project settings and
   set `engines.node` to `24.x`. Build command: the default (`npm run build`,
   which first runs `npm run images`; with no `<seller>/<product>/media` folder it copies `media-web` as it is).
   Output and install commands: the defaults.
3. Add the environment variables below (Production), **then** deploy. Two of them are read at build time
   (`NEXT_PUBLIC_PROTOTYPE_NOTE`, `REVIEW_THEME_SWITCHER`), so a change needs a new deployment.

## Variables

| Variable | Value | Effect |
|---|---|---|
| `CONTENT_PRODUCT` | (optional) | `<seller>/<product>`: which product is the page (it replaces the old `CONTENT_SLUG`, which now stops with an error). A snapshot holds a single product, so the variable is optional there: the only product is used. |
| `CONTENT_DIR` | (leave unset) | The content root. The snapshot always has its content in `./content`, so a deployment does not set it. |
| `REVIEW_PASSWORD` | a long random string | When set, **every** request (pages, images, static files, API) needs HTTP Basic auth: any user name, this password. Without it nothing is protected. Only `/robots.txt` stays open so crawlers read "disallow all". **Known problem (found with `verify:deploy`): with the password set, the image optimizer's internal request for a local photo carries no `Authorization` header, gets the 401, and `/_next/image` answers 404, so the photos do not show. A deployment for the pipeline test therefore sets no password (`noindex` is always sent).** |
| `NEXT_PUBLIC_PROTOTYPE_NOTE` | `1` | Shows the footer line "Prototype. Content is a draft and not yet confirmed by the seller." (German: "Prototyp. Die Inhalte sind ein Entwurf und noch nicht vom Verkäufer bestätigt."). Leave it out to hide it. It also puts one honest line next to the submit button of the contact dialog: "Prototype: requests are not delivered yet." (German: "Prototyp: Anfragen werden noch nicht zugestellt."), because until a lead store is configured (see "Leads") nothing is delivered. Without the variable nothing changes; with no store the API still answers 503 and the form shows the seller's e-mail link, never a success. |
| `REVIEW_THEME_SWITCHER` | `1` (optional) | Shows the small theme switcher in production, so the reviewer can compare the two themes. **Must not be set for a final public release.** It also makes the page render per request instead of being static. **Observation, not a proven cause:** on a Vercel deployment, setting `REVIEW_THEME_SWITCHER=1` made the page render at request time and the loader then failed with "file not found in media-web/" (the production build had passed); after removing the variable the page was static and worked. Recommendation: do not set `REVIEW_THEME_SWITCHER` on a host until this is fixed. |

A demo that was deployed from an older snapshot keeps working on that snapshot (it is self-contained and still reads `CONTENT_SLUG`) until you build a new snapshot and update the deployment; only a new snapshot uses `CONTENT_PRODUCT` and the seller layout.

`npm run check:template-clean` (by hand, not part of the build or CI) tells whether this working tree still holds a seller's data. It is expected to fail until `docs/MOVE-CONTENT.md` has been carried out; the snapshot does not depend on it, because the snapshot is a whitelist of one product.

Always on, whatever the variables are: `X-Robots-Tag: noindex, nofollow` on every response, a `noindex` meta tag and
`robots.txt` with `Disallow: /`. The development theme switcher and development warnings never render in production.

## What the reviewer sees

- A browser password prompt (user name: anything). A wrong password shows the prompt again.
- One landing page for the product in the snapshot: header strip, hero (title, photo, price, key facts, two buttons), photo gallery with lightbox, specs, the offer, FAQ and footer, in the first language of the product.
- Light theme by default; dark theme only with `REVIEW_THEME_SWITCHER=1`.

## Known limits of this demo

- **Leads need a store.** The contact form answers honestly when no store works: with `LEADS_STORE` unset (or a store that fails, such as a read-only file system) the API answers 503 and the form shows the seller's e-mail address; it never claims to have saved anything. See "Leads" below.
- **The content is a draft, not confirmed by the seller.** Prices and contact details may be placeholders, an address or imprint may be missing, and translated texts are AI drafts.
- **The photos may not be cleaned.** Before a snapshot is shared, check them for readable third-party license plates, faces and reflections of people. GPS and camera data are removed in the web copies (a guard refuses any image that still has EXIF).
- No analytics, no cookies, no third-party requests on page load (unless the product uses an embedded video).

`npm run export:template -- --out <folder>` makes the clean template repository for the deployment of the examples below (see PROJECT.md; it prints no push command and adds no remote).

## Leads (the contact form)

The form posts to `POST /api/lead` (same origin only). A host with a read-only file system (Vercel) cannot use the file store; use a webhook, or the form answers 503 and shows the seller's e-mail address.

| Variable | Value | Effect |
|---|---|---|
| `LEADS_STORE` | `file`, `webhook` or `telegram` | Where leads go. **Not set (or anything else): the API answers 503**; nothing is stored and the form says so. |
| `LEADS_DIR` | (optional, `file` only) | Folder for the lead files; default `./data/leads` (git-ignored; the snapshot guard refuses it). Must be writable. |
| `LEADS_WEBHOOK_URL` | an `https://` URL (`webhook` only) | Receives each lead as JSON (`POST`, 5 second timeout). Anything but a 2xx answer counts as a failure (503). Treat the URL as a secret. |
| `LEADS_NOTIFY` | `telegram` | Tells a Telegram chat AFTER another store accepted the lead; never changes the visitor's answer. A notifier alone is not a store (503). Not together with `LEADS_STORE=telegram`. |
| `TELEGRAM_BOT_TOKEN` | the bot's token (**Sensitive**) | Set as a sensitive/encrypted host variable, never `NEXT_PUBLIC_`, never committed. |
| `TELEGRAM_CHAT_ID` | the chat's numeric id or `@channel` | Find it with `npm run telegram:chats`. |
| `TELEGRAM_DETAIL` | `full` or `short` | Default `full` for the store, `short` for the notifier (`full` there only when set explicitly). |

Read at run time (not build time), so a change needs a redeploy only because the host restarts. What the API knows about the site (product, languages, consent text hashes) is computed at build time and inlined, so the function needs no content files.

- **Region.** Function code runs in the host's default region. For a seller in the EU set the project's **Function Region** to a European one in the host's project settings (Vercel: Settings > Functions). It is a project setting; do not add config files for it that have not been verified.
- **Rate limit.** In memory, 5 posts per client per 10 minutes: every server instance counts for itself, so on a host with several instances the real limit is higher. It is a prototype safeguard; use the host's own rate limiting for a public site.
- **Retention.** `npm run leads:purge [-- --days N] [--write]` deletes lead files older than N days (default 90; a dry run unless `--write`; `file` store only). A webhook's receiver has its own retention.
- **Telegram.** A host with a read-only file system (Vercel) can deliver to Telegram with no database: set `LEADS_STORE=telegram`, or keep another store and add `LEADS_NOTIFY=telegram`. Setup, token rotation (`/revoke`), the `telegram:chats` and `telegram:test` commands and the privacy notes (Telegram stores messages and processes data outside the EU; use `short` for real visitors): `docs/LEADS.md`. The notification is awaited before the answer (4 s for a notifier, 8 s for a store).
- **Verify the honest failure:** with `LEADS_STORE` unset, `curl -s -X POST -H 'content-type: application/json' -H 'x-lead-request: 1' -d '{}' <url>/api/lead` must not answer 200.

## Check a deployment

```
npm run verify:deploy -- <url> [--product <seller>/<product>] [--auth user:password]
```

One GET of `/` (it follows the redirect to the default language) and a few more requests (fetch only). It prints PASS or FAIL with a reason for: status 200 and HTML; `lang` on `<html>`; `X-Robots-Tag: noindex`; the product title in the default language (read from the local content root, `CONTENT_DIR` also from `.env.local`; `--product` or `CONTENT_PRODUCT`) is in the HTML; every id in `data-block-order` has a `<section>`; every `<img>` src and the first `srcset` URL is 200 with an image type; `/robots.txt` disallows all; the footer shows the seller's `displayName`. Then, from the local `seller.json`, the language routes: **`/` redirects to `/<defaultLanguage>`** (a 3xx with that `Location`, not followed), and for **every language of the seller** `GET /<lang>` is 200, `<html lang>` equals the route, the page has `hreflang` links for every language and for `x-default`, a canonical link to itself, and the product title in that language. Finally one check that the footer's contact row (an element with `id="contact"`) exists on every language route, holds no form (the form lives only in the dialog) and has the seller's e-mail link. "contact" in `data-block-order` is the footer row, so it is not required to be a `<section>`. That is 8 checks plus 1 (the redirect) plus one per language plus 1 (the contact section): 12 for the two-language examples. A language the product has no title for must show the default title. Exit code 1 on any FAIL. `--auth` is sent to the site's own host only.

The page routes are `/<lang>` (one static page per language of the seller; any other path is a 404). `/` answers with a 307 from the proxy (so it carries `X-Robots-Tag` and is behind `REVIEW_PASSWORD` like every other path); there is no redirect by `Accept-Language`.

## Deploy the template alone (preview of the examples)

The template repository (no `content/` folder, no real data) builds and serves the fake examples. In Vercel set exactly these two variables (Production), then deploy:

| Variable | Value |
|---|---|
| `CONTENT_DIR` | `examples` |
| `CONTENT_PRODUCT` | `example-seller/example-house` (or `example-seller/example-watch`, `example-seller/example-bag`) |

Nothing else is needed: no `REVIEW_PASSWORD` (the page is `noindex` anyway, see above), no `NEXT_PUBLIC_PROTOTYPE_NOTE`. The old `CONTENT_SLUG` no longer exists; if it is still set, the build stops and tells you to rename it. Without `CONTENT_DIR` (and without a `./content` folder) the build fails on purpose, with a message that names `CONTENT_DIR=examples`. Locally: `CONTENT_DIR=examples CONTENT_PRODUCT=example-seller/example-house npm run build && npm start`, then `npm run verify:deploy -- http://localhost:3000 --product example-seller/example-house` (the content root of that command is read from the same `CONTENT_DIR`).

## After the demo

1. **Delete the Vercel project** (Settings > General > Delete Project). This also removes the deployment and its URL.
2. **Archive or delete the snapshot repository.** The photos and notes in it are not for publishing.
3. **Rotate `REVIEW_PASSWORD`** (or simply do not reuse it): anyone who got it could open an old deployment.
4. **Never reuse the snapshot for a public release.** It contains photos that may not be cleaned and unconfirmed draft content. A release is
   built from the real repository with cleaned photos, real data, no `REVIEW_PASSWORD`, no `REVIEW_THEME_SWITCHER`
   and no `NEXT_PUBLIC_PROTOTYPE_NOTE`, and the `noindex` settings are removed on purpose (not by accident).

## Voice assistant widget

The widget is configured in the seller's `seller.json` (`agent` object, see `docs/PAGE-API.md`), not in an environment variable, and the embed id is not stored in this repository. **The widget's domain restriction (which sites may load the agent) is a setting in the Hanc project, not code:** add the deployment's domain there, and `localhost` for a local try, or the widget will not connect. The package is pinned exactly and bundled with the page; nothing is loaded from a CDN.

## Background music

A product with a `music` object loads nothing until the visitor starts the music: no audio file is requested on page load (the audio element is created at the first start), and the music comes from the deployment itself, never from a third-party host. The audio files do add to the size of the deployed repository, because the snapshot carries `media-web/audio`. Advice: mp3 at about 128 kbps, at most 3 MB per track (the hard limit is 5 MB), and few tracks. A track needs a commercial licence; the proof stays in the content repository, not in the template.

