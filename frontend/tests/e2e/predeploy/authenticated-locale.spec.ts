import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "../fixtures/test-helpers";

/**
 * Run only against a dedicated nonproduction server with a real disposable test
 * user. The public Chromium suite has separate mocked-auth coverage.
 *
 * KIMA_E2E_LOCALE_WALKTHROUGH=1 \
 * KIMA_UI_BASE_URL=http://<isolated-test-host>:3030 \
 * KIMA_TEST_USERNAME=<test-user> KIMA_TEST_PASSWORD=<test-password> \
 * npx playwright test tests/e2e/predeploy/authenticated-locale.spec.ts
 */
test.describe("Authenticated language walkthrough", () => {
    test.skip(
        process.env.KIMA_E2E_LOCALE_WALKTHROUGH !== "1",
        "Opt in only on an isolated nonproduction installation with disposable E2E credentials.",
    );

    test("retains Dutch across authenticated settings, search, navigation and reload", async ({ page }) => {
        await loginAsTestUser(page);
        await page.goto("/settings#language");

        const languageSelect = page.locator("#language-select");
        await expect(languageSelect).toHaveValue("en");

        await languageSelect.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Instellingen", exact: true })).toBeVisible();
        await expect(page.locator("#language").getByRole("heading", { name: "Taal" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await page.goto("/search");
        await expect(page.getByRole("heading", { name: "Vind jouw muziek" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await page.goto("/settings#language");
        await expect(languageSelect).toHaveValue("nl");
        await page.reload();
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await languageSelect.selectOption("en");
        await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
        await page.goto("/search");
        await expect(page.getByRole("heading", { name: "Find Your Sound" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });

    test("keeps real library tracks unchanged when translating collection controls", async ({ page }) => {
        test.skip(
            process.env.KIMA_E2E_EXPECT_SYNTHETIC_MUSIC !== "1",
            "This regression requires the disposable AIO's synthetic audio fixture.",
        );
        await loginAsTestUser(page);
        await page.goto("/collection?tab=tracks");

        await expect(page.getByRole("heading", { name: "Collection", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Tracks", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByText("CI Generated 440Hz Tone", { exact: true }).first()).toBeVisible();

        await page.goto("/settings#language");
        await page.locator("#language-select").selectOption("nl");
        await page.goto("/collection?tab=tracks");

        await expect(page.getByRole("heading", { name: "Collectie", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Nummers", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByText("CI Generated 440Hz Tone", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Titel", { exact: true }).first()).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await page.goto("/settings#language");
        await page.locator("#language-select").selectOption("en");
        await page.goto("/collection?tab=tracks");
        await expect(page.getByRole("heading", { name: "Collection", exact: true })).toBeVisible();
        await expect(page.getByText("CI Generated 440Hz Tone", { exact: true }).first()).toBeVisible();
    });

    test("makes the saved language selector usable after login on a mobile viewport", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await loginAsTestUser(page);
        await page.goto("/settings#language");

        const languageSelect = page.locator("#language-select");
        await expect(languageSelect).toBeVisible();
        await languageSelect.selectOption("nl");
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await page.reload();
        await expect(languageSelect).toHaveValue("nl");
        await expect(page.locator("#language").getByRole("heading", { name: "Taal" })).toBeVisible();

        const box = await languageSelect.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    });
});
