# Deploy repository (generated, do not edit here)

This repository was **generated** by `npm run snapshot` from a template repository and a content repository. It holds one
product, `good-point/vw-multivan`, with its processed photos, and is built by the host. Changes made here by hand are overwritten by the next
`--update`: change the source repositories and regenerate instead.

| | |
|---|---|
| Product | `good-point/vw-multivan` |
| Template version | `0.8.0` |
| Template commit | `c614e82` |
| Content commit | `2ae1f16` |
| Generated (UTC) | 2026-10-30 17:55 |

A commit ending in `-dirty` means the source had uncommitted changes when this was generated. "Not recorded" means the
source was in no git repository of its own. The same data is in `version.json`.

## Regenerate

In a checkout of the template repository, with `CONTENT_DIR` pointing to the content repository (in the shell or in
`.env.local`; see `.env.example` there), run:

```
npm run snapshot -- --product good-point/vw-multivan --out <path to this folder> --update
```

`--update` replaces the working tree of this repository (everything except `.git`), makes ONE commit
"Update: <changed paths>" on top of the history and prints the `git push` command for you to run; it adds no remote and pushes
nothing. Use `--replace` instead of `--update` to rebuild a repository whose last commit is "Demo snapshot". The
snapshot reads the tracked files of the template's current commit, so commit the template before regenerating.

## How the host builds it

The host (for example Vercel) imports this repository as a **Next.js** project and runs the defaults: `npm ci` (or `npm install`),
`npm run build` (which first runs `npm run images` and then `next build`), with **Node.js 22.x**. The content is already inside
the repository (`content/`, with processed photos in `media-web/`), so `CONTENT_DIR` must stay **unset**. The build prerenders one
static page per language (`/<lang>`). After a deployment, check it with `npm run verify:deploy -- <url>` (add `--release` for
a public release). `DEPLOY.md` describes the demo deployment and the release checklist.

## Environment variables of the project

Names only; the values are set in the host's project settings (Settings, Environment Variables), never in this repository.
Variables marked build are read when the site is built, so a change needs a new deployment.

| Variable | Needed | Kind |
|---|---|---|
| `CONTENT_PRODUCT` | no (this repository holds one product) | build |
| `NEXT_PUBLIC_PROTOTYPE_NOTE` | optional, marks a demo | build |
| `REVIEW_THEME_SWITCHER` | optional, demo only | build |
| `LEADS_STORE` | for a working contact form | run |
| `LEADS_NOTIFY` | optional | run |
| `TELEGRAM_BOT_TOKEN` | with Telegram, **secret** | run |
| `TELEGRAM_CHAT_ID` | with Telegram | run |
| `TELEGRAM_DETAIL` | optional | run |
| `LEADS_WEBHOOK_URL` | with a webhook store, **secret** | run |
| `SITE_INDEXABLE` | release only, Production only | build |
| `SITE_URL` | with `SITE_INDEXABLE` | build |

With none of them set the site builds as a private demo: every page is `noindex` and the contact form says honestly that it
cannot deliver. `CONTENT_DIR` and `LEADS_DIR` are not used on a host.

## Where the sources are

The template repository (code, themes, examples, documentation) and the content repository (seller and product files, photos)
are private repositories kept by the maintainers of this site; ask them for access. The documentation of the template
(README, PROJECT.md, docs/) lives there and is not part of this repository.
