import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e/player-ui",
    testMatch: "**/*.browser.spec.ts",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    reporter: "list",
    outputDir: "test-results/player-ui",
    use: { browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
