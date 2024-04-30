import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.spec.js"],
    exclude: ["tests/e2e/**/*"],
    alias: {
      "@transcribe/shout": "/tests/mocks/shout.js",
    },
  },
});
