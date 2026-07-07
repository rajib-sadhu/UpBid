import { defineConfig } from "vitest/config";

// Integration suite: *.itest.ts files run against a real MySQL database
// (`<db>_itest`, force-reset by global-setup). Kept out of the default unit
// run (`npm test`), which stays DB-free and fast.
export default defineConfig({
  test: {
    include: ["src/**/*.itest.ts"],
    globalSetup: "./src/test/global-setup.ts",
    setupFiles: ["./src/test/itest-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
