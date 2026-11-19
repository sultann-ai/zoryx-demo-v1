import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "prisma/demo/**/*.test.ts"],
    // Route and socket tests import the whole app in beforeAll; with every file running in parallel
    // that import alone can pass the 10 s default on a busy machine (seen as intermittent
    // "Hook timed out" failures). Generous for setup only — test bodies keep the 5 s default.
    hookTimeout: 30_000,
  },
});
