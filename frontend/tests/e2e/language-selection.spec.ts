import { expect, test } from "@playwright/test";

test.describe("Interface language", () => {
    test("switches the public login UI to Dutch and remembers the choice", async ({ page }) => {
        await page.goto("/login");

        const languageSelect = page.locator("#login-language");
        await expect(languageSelect).toBeVisible();
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

        await languageSelect.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");
        await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();

        await page.reload();
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await languageSelect.selectOption("en");
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("keeps language selection separate from server-side credentials", async ({ page }) => {
        await page.goto("/login");
        await page.locator("#login-language").selectOption("nl");
        await page.locator("#username").fill("example-user");
        await page.locator("#password").fill("example-password");
        await page.locator("#login-language").selectOption("en");
        await expect(page.locator("#username")).toHaveValue("example-user");
        await expect(page.locator("#password")).toHaveValue("example-password");
    });
    test("allows choosing Dutch during first-run setup without an account", async ({ page }) => {
        await page.goto("/onboarding");
        const languageSelect = page.locator("#onboarding-language");
        await expect(languageSelect).toBeVisible();
        await expect(page.getByRole("heading", { name: "Create Your Admin Account" })).toBeVisible();

        await page.locator("#username").fill("sample-admin");
        await languageSelect.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Maak je beheerdersaccount aan" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");
        await expect(page.locator("#username")).toHaveValue("sample-admin");

        await page.reload();
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.getByRole("heading", { name: "Maak je beheerdersaccount aan" })).toBeVisible();

        await page.goto("/login");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
    });
    test("synchronizes the browser language across existing tabs", async ({ page, context }) => {
        await page.goto("/login");
        const secondTab = await context.newPage();
        await secondTab.goto("/login");

        const firstSelect = page.locator("#login-language");
        const secondSelect = secondTab.locator("#login-language");
        await expect(firstSelect).toHaveValue("en");
        await expect(secondSelect).toHaveValue("en");

        await firstSelect.selectOption("nl");
        await expect(secondSelect).toHaveValue("nl");
        await expect(secondTab.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
        await expect(secondTab.locator("html")).toHaveAttribute("lang", "nl");

        await secondSelect.selectOption("en");
        await expect(firstSelect).toHaveValue("en");
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await secondTab.close();
    });

    test("defaults to English for an unrecognized stored language", async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem("kima-hub-language", "de");
        });
        await page.goto("/login");

        await expect(page.locator("#login-language")).toHaveValue("en");
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("keeps language controls usable in narrow mobile viewports", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto("/login");

        const loginLanguage = page.locator("#login-language");
        await expect(loginLanguage).toBeVisible();
        await loginLanguage.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();

        await page.goto("/onboarding");
        const onboardingLanguage = page.locator("#onboarding-language");
        await expect(onboardingLanguage).toBeVisible();
        await expect(onboardingLanguage).toHaveValue("nl");
        await expect(page.getByRole("heading", { name: "Maak je beheerdersaccount aan" })).toBeVisible();

        // Language selection must remain horizontally reachable on mobile.
        const selectBounds = await onboardingLanguage.boundingBox();
        expect(selectBounds).not.toBeNull();
        expect(selectBounds!.x).toBeGreaterThanOrEqual(0);
        expect(selectBounds!.x + selectBounds!.width).toBeLessThanOrEqual(375);
    });

    test("changes language on authenticated settings without modifying server preferences", async ({ page }) => {
        // Mock a regular signed-in account. No real user, token, or backend is needed.
        await page.route("**/api/**", async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            const responses: Record<string, unknown> = {
                "/api/auth/me": {
                    id: "locale-test-user",
                    username: "locale-test-user",
                    role: "user",
                    canRequestAlbums: false,
                    canDownloadTracks: false,
                    onboardingComplete: true,
                },
                "/api/settings": {
                    playbackQuality: "original",
                    wifiOnly: false,
                    offlineEnabled: false,
                    maxCacheSizeMb: 5120,
                },
                "/api/api-keys": { apiKeys: [] },
                "/api/auth/2fa/status": { enabled: false },
                "/api/system-settings/public-config": { publicUrl: "" },
            };
            if (pathname in responses) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(responses[pathname]),
                });
                return;
            }
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({ error: "Unavailable in isolated locale test" }),
            });
        });
        await page.addInitScript(() => {
            localStorage.setItem("auth_token", "local-test-only-token");
        });

        await page.goto("/settings#language");
        const languageSelect = page.locator("#language-select");
        await expect(languageSelect).toBeVisible();
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        await expect(page.locator("#language").getByRole("heading", { name: "Language" })).toBeVisible();

        await languageSelect.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Instellingen", exact: true })).toBeVisible();
        await expect(page.locator("#language").getByRole("heading", { name: "Taal" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await page.reload();
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.getByRole("heading", { name: "Instellingen", exact: true })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await languageSelect.selectOption("en");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

});
