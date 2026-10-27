# Luxury landing template

A single-page landing for selling one luxury item, built from blocks in `<content root>/<slug>/product.json` (`CONTENT_DIR`, default `./content`; fake samples in `examples/`: `CONTENT_DIR=examples npm run dev`) and styled by a swappable theme.

```
npm install
npm run dev        # http://localhost:3000   (?theme=dark-premium to try another theme)
npm test && npm run lint && npm run build
```

Everything else (contracts, plan, decisions, how to add a theme or product) is in [PROJECT.md](PROJECT.md); history is in [PROGRESS.md](PROGRESS.md).

A private review demo (password, noindex, snapshot repository, Vercel): [DEPLOY.md](DEPLOY.md).
