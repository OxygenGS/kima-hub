import { expect, test, type Page, type Locator } from "@playwright/test";
import { loginAsTestUser, getAuthToken } from "../fixtures/test-helpers";
import { PLAYER, readPlayer } from "../fixtures/shared";
import { translate } from "../../../lib/i18n/translations";
import packageMetadata from "../../../package.json";

// No page.route, provider mocks, synthetic playback state or forced currentTime.
// All controls below operate on the built application and its real audio element.
async function checkBounds(page: Page, surface: Locator) {
    await expect(surface).toBeVisible();
    const dimensions = await surface.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: window.innerWidth, scroll: node.scrollWidth, client: node.clientWidth };
    });
    expect(dimensions.left).toBeGreaterThanOrEqual(-1);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function advance(page: Page) {
    await expect.poll(async () => (await readPlayer(page)).paused).toBe(false);
    const initial = (await readPlayer(page)).t;
    await expect.poll(async () => (await readPlayer(page)).t).toBeGreaterThan(initial + 0.15);
    expect((await readPlayer(page)).ready).toBeGreaterThanOrEqual(2);
}

async function closeFixtureNotices(page: Page) {
    const token = await getAuthToken(page);
    expect(token).not.toBe("");
    const headers = { Authorization: `Bearer ${token}` };
    const current = await page.request.get("/api/whats-new/current", { headers });
    expect(current.ok()).toBe(true);
    const currentBody = await current.json() as { release: { version: string; items: { kind: string; key: string }[] } };
    expect(currentBody.release.version).toBe(packageMetadata.version);
    // Playback acceptance verifies the current release, not a pinned older
    // catalog's item keys. Exact editorial text/keys are reviewed separately
    // in the versioned backend catalog and Dutch release-copy tests.
    const items = currentBody.release.items;
    expect(items.length).toBeGreaterThan(0);
    const keys = items.map((item) => item.key);
    expect(keys.every((key) => key.trim().length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    // Synthetic CI users may dismiss informational notices only: never
    // silently accept a future action or choice in the playback test.
    expect(items.every((item) => item.kind === "note")).toBe(true);
    const pending = await page.request.get("/api/whats-new/pending", { headers });
    expect(pending.ok()).toBe(true);
    const body = await pending.json() as { releases: { version: string }[] };
    // Dismiss informational/optional prompts only for these synthetic CI users.
    // Never invoke an action, accept a choice or reset enrichment.
    for (const release of body.releases) {
        const dismissed = await page.request.post(`/api/whats-new/${release.version}/dismiss`, { headers, data: {} });
        expect(dismissed.ok()).toBe(true);
    }
}

async function verifyOwnedFixture(page: Page) {
    const token = await getAuthToken(page);
    const headers = { Authorization: `Bearer ${token}` };
    const expectedTracks = ["ci-ui-track-one", "ci-ui-track-two", "ci-ui-track-three"];
    const response = await page.request.get("/api/library/albums/ci-ui-album", { headers });
    expect(response.ok(), "The generated library album must exist before UI acceptance").toBe(true);
    const album = await response.json() as { owned: boolean; tracks: { id: string }[] };
    expect(album.owned, "The generated album needs its real OwnedAlbum relation, not preview status").toBe(true);
    expect(album.tracks.map((track) => track.id)).toEqual(expectedTracks);

    // Exercise the real database-only endpoint for both CI roles and architectures.
    const overview = await page.request.get("/api/library/artists/ci-ui-artist/overview", { headers });
    expect(overview.ok()).toBe(true);
    const artist = await overview.json() as {
        id: string;
        albums: { id: string; owned: boolean; tracks: { id: string; filePath?: string }[] }[];
        topTracks: unknown[];
        similarArtists: unknown[];
    };
    expect(artist.id).toBe("ci-ui-artist");
    const localAlbum = artist.albums.find((entry) => entry.id === "ci-ui-album");
    expect(localAlbum?.owned).toBe(true);
    expect(localAlbum?.tracks.map((track) => track.id)).toEqual(expectedTracks);
    expect(localAlbum?.tracks.every((track) => track.filePath === undefined)).toBe(true);
    expect(artist.topTracks).toEqual([]);
    expect(artist.similarArtists).toEqual([]);

    // The built AIO must exercise PostgreSQL's real typo indexes (not mocked
    // search responses) for both synthetic roles, both locales and both CPUs.
    for (const candidate of [
        { type: "artists", q: "CI Interfce Artist", id: "ci-ui-artist" },
        { type: "albums", q: "CI Interfce Album", id: "ci-ui-album" },
        { type: "tracks", q: "CI Interfce Track One", id: "ci-ui-track-one" },
    ] as const) {
        const search = await page.request.get("/api/search", {
            headers,
            params: { q: candidate.q, type: candidate.type, limit: 20 },
        });
        expect(search.ok(), `Indexed ${candidate.type} typo lookup should respond`).toBe(true);
        const body = await search.json() as Record<string, { id: string }[]>;
        expect(body[candidate.type].some((entry) => entry.id === candidate.id)).toBe(true);
    }
}

for (const locale of ["en", "nl"] as const) {
    test(`integrated ${locale} interface retains real playback and queue behavior`, async ({ page, isMobile }, testInfo) => {
        const t = (key: string) => translate(locale, key);
        const uncaught: string[] = [];
        page.on("pageerror", (error) => uncaught.push(error.message));
        await loginAsTestUser(page);
        await closeFixtureNotices(page);
        await verifyOwnedFixture(page);
        await page.goto("/settings#language");
        await page.locator("#language-select").selectOption(locale);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);

        await page.goto("/");
        await expect(page.locator("#home-heading")).toHaveText(locale === "nl" ? "Tijd voor iets goeds." : "Make room for a good listen.");
        await checkBounds(page, page.locator('section[aria-labelledby="home-heading"]'));
        await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
        await page.goto("/artist/ci-ui-artist");
        await expect(page.locator('[data-music-detail="artist"] h1')).toHaveText("CI Interface Artist");
        await checkBounds(page, page.locator('[data-music-detail="artist"]'));
        await page.goto("/album/ci-ui-album");
        const album = page.locator('[data-music-detail="album"]');
        await expect(album.locator("h1")).toHaveText("CI Interface Album");
        await checkBounds(page, album);
        await page.screenshot({ path: testInfo.outputPath("album.png"), fullPage: true });
        await album.getByRole("button", { name: t("play all"), exact: true }).click();
        await expect(page.locator(PLAYER)).toHaveCount(1);
        await advance(page);
        const audio = await page.locator(PLAYER).elementHandle();
        expect(audio).not.toBeNull();
        const source = (await readPlayer(page)).src;
        expect(source).toContain("ci-ui-track-one");
        const overlay = page.locator("[data-overlay-player]");
        const smallPlayer = page.locator(isMobile ? "[data-mobile-player]" : "[data-player-dock]");

        // Starting an album shows the normal player on both screen sizes.
        // The full-screen overlay is intentionally opened only by the user.
        await expect(overlay).toHaveCount(0);
        await expect(smallPlayer).toBeVisible();
        await smallPlayer.getByRole("button", { name: t("Pause"), exact: true }).click();
        await expect.poll(async () => (await readPlayer(page)).paused).toBe(true);
        const stoppedAt = (await readPlayer(page)).t;
        await page.waitForTimeout(250);
        expect(Math.abs((await readPlayer(page)).t - stoppedAt)).toBeLessThan(0.08);
        await smallPlayer.getByRole("button", { name: t("Play"), exact: true }).click();
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        await checkBounds(page, smallPlayer);
        await smallPlayer.getByRole("button", { name: t("Expand player"), exact: true }).click();
        await expect(overlay).toBeVisible();
        await expect(overlay.locator("h1")).toHaveText("CI Interface Track One");
        await checkBounds(page, overlay);
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        expect(await audio!.evaluate((node) => node.isConnected)).toBe(true);
        // Closing and explicitly reopening must not restart or replace audio.
        await overlay.getByRole("button", { name: t("close"), exact: true }).click();
        await expect(overlay).toHaveCount(0);
        await expect(smallPlayer).toBeVisible();
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        expect(await audio!.evaluate((node) => node.isConnected)).toBe(true);
        await smallPlayer.getByRole("button", { name: t("Expand player"), exact: true }).click();
        await expect(overlay).toBeVisible();
        await expect(overlay.locator("h1")).toHaveText("CI Interface Track One");
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        expect(await audio!.evaluate((node) => node.isConnected)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("overlay.png"), fullPage: true });
        if (isMobile) {
            await page.setViewportSize({ width: 844, height: 390 });
            await checkBounds(page, overlay);
            await expect(overlay.getByRole("button", { name: t("close"), exact: true })).toBeVisible();
            await page.setViewportSize({ width: 390, height: 844 });
        }
        // Client-side navigation must retain the same audio node and source.
        await overlay.getByRole("link", { name: t("Queue"), exact: true }).click();
        await expect(overlay).toHaveCount(0);
        const queue = page.locator("[data-queue-surface]");
        await expect(queue).toBeVisible();
        await expect(queue.locator("[data-queue-index]")).toHaveCount(2);
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        expect(await audio!.evaluate((node) => node.isConnected)).toBe(true);
        await queue.getByRole("button", { name: `${t("Move up")}: CI Interface Track Three`, exact: true }).click();
        await expect(queue.locator('[data-queue-index="1"] h3')).toHaveText("CI Interface Track Three");
        expect((await readPlayer(page)).src).toBe(source);
        await queue.getByRole("button", { name: `${t("Remove from queue")}: CI Interface Track Three`, exact: true }).click();
        await expect(queue.locator("[data-queue-index]")).toHaveCount(1);
        await checkBounds(page, queue);
        await page.screenshot({ path: testInfo.outputPath("queue.png"), fullPage: true });
        await queue.getByRole("button", { name: t("Clear queue"), exact: true }).click();
        const confirmation = page.getByRole("dialog", { name: t("Clear the queue?"), exact: true });
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole("button", { name: t("Cancel"), exact: true }).click();
        await expect(confirmation).toHaveCount(0);
        await expect(queue.locator("[data-queue-index]")).toHaveCount(1);
        await advance(page);
        expect((await readPlayer(page)).src).toBe(source);
        expect(await audio!.evaluate((node) => node.isConnected)).toBe(true);
        await page.locator(isMobile ? "[data-mobile-player]" : "[data-player-dock]")
            .getByRole("button", { name: t("Pause"), exact: true }).click();
        await expect.poll(async () => (await readPlayer(page)).paused).toBe(true);
        expect(uncaught).toEqual([]);
    });
}
