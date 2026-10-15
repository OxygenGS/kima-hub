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

    test("can switch Dutch in a storage-blocked browser for the current tab", async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, "localStorage", {
                configurable: true,
                get() {
                    throw new DOMException("Storage disabled", "SecurityError");
                },
            });
        });
        await page.goto("/login");

        const select = page.locator("#login-language");
        await expect(select).toHaveValue("en");
        await select.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");

        await select.selectOption("en");
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
        await select.selectOption("nl");
        await expect(page.getByRole("heading", { name: "Welkom terug" })).toBeVisible();

        // Storage is blocked, so the preference should not survive a full reload.
        await page.reload();
        await expect(select).toHaveValue("en");
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


    test("keeps TV remote navigation stable while labels and branding follow the UI", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("kima-hub-language", "nl"));
        await page.route("**/api/**", async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === "/api/auth/me") {
                return route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({ id: "tv-ci", username: "tv-listener", role: "user", onboardingComplete: true }),
                });
            }
            if (pathname === "/api/branding") {
                return route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        name: "CI TV", tagline: "Test branding", logoUrl: "/assets/images/kima.webp",
                        faviconUrl: "/favicon.ico", hasCustomLogo: true, hasCustomFavicon: false,
                        accentColor: "#fca200", backgroundColor: "#0a0a0a",
                    }),
                });
            }
            return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
        });
        await page.goto("/?tv=1");
        const tvNav = page.getByRole("navigation", { name: "Tv-navigatie" });
        await expect(tvNav).toBeVisible();
        await expect(tvNav.getByRole("link", { name: "Zoeken" })).toHaveAttribute("href", "/search");
        await expect(tvNav.getByRole("link", { name: "Ontdekken" })).toHaveAttribute("href", "/discover");
        await expect(page.getByRole("button", { name: "Bibliotheek synchroniseren" })).toBeVisible();
        await expect(page.locator(".tv-logo")).toContainText("CI TV");
        await expect(page.locator(".tv-logo img")).toBeVisible();

        // Emulate the same language-change event emitted by the language selector,
        // and confirm that neither route destinations nor branding are translated.
        await page.evaluate(() => {
            localStorage.setItem("kima-hub-language", "en");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });
        await expect(page.getByRole("navigation", { name: "TV navigation" })
            .getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
        await expect(page.getByRole("button", { name: "Sync library" })).toBeVisible();
        await expect(page.locator(".tv-logo")).toContainText("CI TV");
    });

    test("translates a public share player and expired-link error without a login", async ({ page }) => {
        await page.addInitScript(() => {
            // Keep a manually selected language across subsequent navigations.
            if (!localStorage.getItem("kima-hub-language")) {
                localStorage.setItem("kima-hub-language", "nl");
            }
        });
        await page.route("**/api/share/**", async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            const expired = pathname === "/api/share/expired-ci-share";
            await route.fulfill({
                status: expired ? 410 : 200,
                contentType: "application/json",
                body: JSON.stringify(expired
                    ? { error: "Share link has expired" }
                    : {
                        entityType: "playlist",
                        entity: {
                            id: "share-playlist-ci", name: "CI Shared Album Name",
                            items: [
                                { track: { id: "one", title: "CI Original Track Title", duration: 180,
                                    album: { title: "CI Original Album", artist: { name: "CI Original Artist" } } } },
                                { track: { id: "two", title: "Second Original Track", duration: 150,
                                    album: { title: "CI Original Album", artist: { name: "CI Original Artist" } } } },
                            ],
                        },
                        createdAt: "2025-01-01T00:00:00Z",
                    }),
            });
        });

        await page.goto("/share/public-ci-share");
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");
        await expect(page.getByRole("heading", { name: "CI Shared Album Name" })).toBeVisible();
        await expect(page.getByText("CI Original Track Title", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Afspelen" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Vorig nummer" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Volgend nummer" })).toBeVisible();
        await expect(page.getByRole("slider", { name: "Afspeelpositie" })).toBeVisible();
        await expect(page.getByRole("slider", { name: "Volume" })).toBeVisible();
        await page.goto("/share/expired-ci-share");
        await expect(page.getByRole("heading", { name: "Deze link is verlopen" })).toBeVisible();
        await expect(page.getByText("Vraag degene die de muziek deelde om een nieuwe link.")).toBeVisible();

        await page.evaluate(() => localStorage.setItem("kima-hub-language", "en"));
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
    });

    test("localizes the new v1.11 Stats page without rewriting its period identifiers", async ({ page }) => {
        const requestedPeriods: string[] = [];
        await page.route("**/api/**", async (route) => {
            const url = new URL(route.request().url());
            const pathname = url.pathname;
            let body: unknown;
            if (pathname === "/api/auth/me") {
                body = {
                    id: "locale-stats-user", username: "locale-stats-user", role: "user",
                    canRequestAlbums: false, canDownloadTracks: false, onboardingComplete: true,
                };
            } else if (pathname === "/api/stats") {
                const period = url.searchParams.get("period") ?? "all";
                requestedPeriods.push(period);
                body = {
                    period,
                    listening: {
                        plays: 0, estimatedSeconds: 0, distinctTracks: 0,
                        distinctArtists: 0, distinctAlbums: 0, firstPlay: null,
                        lastPlay: null, bySource: {}, clock: [], peak: null,
                        shape: [], drift: [], topArtists: [], topTracks: [],
                    },
                    shelf: {
                        tracks: { total: 0, heard: 0 }, albums: { total: 0, heard: 0 },
                        artists: { total: 0, heard: 0 },
                        analysis: { done: 0, pending: 0, failed: 0, total: 0 },
                        neverPlayed: 0, decades: [],
                    },
                    spoken: {
                        audiobooks: {
                            seconds: 0, finished: 0, inProgress: 0, setAside: 0,
                            topAuthors: [], current: null,
                        },
                        podcasts: {
                            seconds: 0, finished: 0, inProgress: 0,
                            subscriptions: 0, backlog: 0,
                        },
                    },
                    signature: {
                        concentration: null, albumHabit: null, era: null, key: null,
                        ownedVsPlayed: [], hourly: [],
                    },
                };
            } else if (pathname === "/api/stats/false-starts") {
                body = {
                    totalRows: 3, totalListens: 3, duplicateRows: 0,
                    collapsibleRows: 0, heard: 1, skipped: 2,
                    tooShort: 0, unclear: 0, earliest: "2025-01-01T00:00:00Z",
                    ignored: [],
                    tracks: [{
                        trackId: "ci-history-fixture", title: "CI History Fixture",
                        artist: "CI Artist", durationSeconds: 180, requiredSeconds: 90,
                        skipped: 2, heard: 1, listens: 3, rows: 3,
                        shortestRunSeconds: 5, lastAt: "2025-01-01T00:00:00Z",
                    }],
                };
            } else {
                body = { error: "Unused in isolated Stats localization test" };
            }
            await route.fulfill({
                status: ["/api/stats", "/api/auth/me", "/api/stats/false-starts"].includes(pathname) ? 200 : 404,
                contentType: "application/json",
                body: JSON.stringify(body),
            });
        });
        await page.addInitScript(() => {
            localStorage.setItem("auth_token", "synthetic-stats-token");
            localStorage.setItem("kima-hub-language", "nl");
        });

        await page.goto("/stats");
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");
        await expect(page.getByRole("tab", { name: "Overzicht" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "nog niets afgespeeld" })).toBeVisible();
        await page.getByRole("button", { name: "30 dagen" }).click();
        await expect(page.getByRole("heading", { name: "niets afgespeeld in deze periode" })).toBeVisible();
        expect(requestedPeriods).toContain("30d");
        // Period values are backend API identifiers, not translated labels.
        expect(requestedPeriods).not.toContain("30 dagen");

        // The new Stats chapters and history-cleanup actions must also follow
        // the browser language, not just the overview heading.
        await expect(page.getByRole("tablist", { name: "statistiekonderdelen" })).toBeVisible();
        await page.getByRole("tab", { name: "Luistergeschiedenis opschonen" }).click();
        await expect(page.getByRole("button", { name: "luistergeschiedenis controleren" })).toBeVisible();

        // A disposable fixture proves dynamic history labels and the caution
        // before deletion are localized without issuing a destructive API call.
        await page.getByRole("button", { name: "luistergeschiedenis controleren" }).click();
        await expect(page.getByText("CI History Fixture", { exact: true })).toBeVisible();
        await expect(page.getByText("overgeslagen (verwijderbaar)", { exact: true })).toBeVisible();
        await page.getByRole("checkbox").first().check();
        await expect(page.getByText("verwijderen wist de overgeslagen afspeelbeurten definitief", { exact: true })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    });

});
