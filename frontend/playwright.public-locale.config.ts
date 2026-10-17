import { defineConfig } from "@playwright/test";

/**
 * Public locale smoke test: login page only. No backend credentials, auth
 * state, database, or production deployment are required.
 *
 * The regular playwright.config.ts continues to cover authenticated E2E tests.
 */
const baseURL = "http://127.0.0.1:3030";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: /language-selection\.spec\.ts$/,
    timeout: 45_000,
    expect: { timeout: 15_000 },
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL,
        browserName: "chromium",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    reporter: "list",
    webServer: {
        command: "npm run dev",
        url: baseURL + "/login",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
