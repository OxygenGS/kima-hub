import { defineConfig } from "@playwright/test";

// This suite writes only to the ephemeral CI fixture. No remote target is accepted.
const baseURL = process.env.KIMA_UI_BASE_URL;
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== "OxygenGS/kima-hub" ||
    baseURL !== "http://127.0.0.1:3130" || process.env.KIMA_E2E_EXPECT_SYNTHETIC_MUSIC !== "1") {
    throw new Error("Release UI acceptance requires the disposable loopback AIO CI fixture");
}
const role = process.env.KIMA_TEST_USERNAME === "ci_audio_admin" ? "admin" : "listener";
export default defineConfig({
    testDir: "./tests/e2e/release-ui",
    outputDir: `./test-results/release-ui/${role}`,
    workers: 1,
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    reporter: [["list"]],
    use: {
        baseURL,
        browserName: "chromium",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "desktop", use: { viewport: { width: 1440, height: 960 } } },
        { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ],
});
