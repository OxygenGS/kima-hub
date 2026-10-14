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
});
