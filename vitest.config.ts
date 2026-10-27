import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadEnvLocal } from "./scripts/lib/load-env-local.mjs";

loadEnvLocal(import.meta.dirname); // so npm test sees CONTENT_DIR from .env.local; real environment variables win

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"] },
});
