# The landing as one image for volkswagen.hanc.ai (Coolify on hanc-prod-web pulls registry.hanc.me/multivan:prod).
# The content is not in this repository: the build context carries it in ./content-repo (the deploy workflow copies
# hanc-ai/good-point-content there), and CONTENT_DIR points at it for the build and at run time.
# Node 22.18+ is needed: the scripts run TypeScript files by stripping types (scripts/lib/node-check.mjs).

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG CONTENT_DIR=content-repo
ARG CONTENT_PRODUCT=good-point/vw-multivan
ENV CONTENT_DIR=$CONTENT_DIR \
    CONTENT_PRODUCT=$CONTENT_PRODUCT
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# The whole build, content included: next start loads next.config.ts again, and it reads the content root.
COPY --from=build --chown=node:node /app /app
ARG CONTENT_DIR=content-repo
ARG CONTENT_PRODUCT=good-point/vw-multivan
# Leads go to Telegram (docs/LEADS.md); the token and the chat come from the deploy workflow's secrets.
ARG LEADS_STORE=telegram
ARG TELEGRAM_BOT_TOKEN
ARG TELEGRAM_CHAT_ID
ENV CONTENT_DIR=$CONTENT_DIR \
    CONTENT_PRODUCT=$CONTENT_PRODUCT \
    LEADS_STORE=$LEADS_STORE \
    TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN \
    TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID
USER node
EXPOSE 3000
CMD ["npm", "start"]
