import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import ts from "typescript";

let js = "";
let css = "";
const baseCss = `:root { --bg-primary:#0a0a0a;--bg-secondary:#0f0f0f;--bg-tertiary:#141414;--bg-hover:#1a1a1a;--border-subtle:#1c1c1c;--border-interactive:#262626;--border-focus:#333;--text-primary:#e5e5e5;--text-secondary:#a3a3a3;--text-muted:#858585;--color-brand:#fca200;--color-brand-hover:#e69200;--color-on-brand:#160a02;--color-danger:#ef4444;--color-danger-light:#f87171;--z-player:45;--z-overlay:200;--nav-h:56px;}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:var(--text-primary);background:var(--bg-primary)}button,input{font:inherit}#fixture-chrome{padding:32px;max-width:600px}#fixture-chrome p{color:var(--text-secondary);line-height:1.7}.fixture-card{height:180px;border:1px solid var(--border-interactive);border-radius:22px;background:var(--bg-secondary);margin-top:30px}#behind{color:var(--text-secondary);border:1px solid var(--border-interactive);background:none;border-radius:10px;padding:10px}svg{flex-shrink:0}`;

// Uses the project's installed React, DOM renderer, icons and CSS module compiler.
// Framework/service boundaries are fixtures; this is not a live audio/backend test.
test.beforeAll(async () => {
    const { build } = await import("vite");
    const root = process.cwd();
    const fixture = resolve(root, "tests/e2e/player-ui/fixture.tsx");
    const mocks = resolve(root, "tests/e2e/player-ui/mock-providers.tsx");
    const mocked = new Set([
        "next/link", "@/hooks/usePlayerControls", "@/hooks/useMediaInfo", "@/hooks/useMediaQuery",
        "@/hooks/useLyricsToggle", "@/lib/i18n/language-context", "@/features/stats/PlayCountLine",
        "@/components/ui/CachedImage", "@/components/lyrics/LyricsView", "./SleepTimer", "./SeekSlider", "./VibeToggleButton",
    ]);
    const outDir = resolve(root, "test-results/player-ui-bundle");
    await build({
        configFile: false, root, publicDir: false, logLevel: "error",
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        css: { postcss: { plugins: [] } },
        plugins: [{
            name: "isolated-player-fixtures", enforce: "pre",
            resolveId(source, importer) {
                if (mocked.has(source)) return mocks;
                if (source.startsWith("@/")) return this.resolve(resolve(root, source.slice(2)), importer, { skipSelf: true });
            },
            transform(code, id) {
                if (!id.includes("node_modules") && /\.tsx?$/.test(id)) return {
                    code: ts.transpileModule(code, { fileName: id, compilerOptions: {
                        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
                    } }).outputText, map: null,
                };
            },
        }],
        build: { outDir, emptyOutDir: true, minify: false, cssCodeSplit: false,
            lib: { entry: fixture, name: "KimaPlayerFixture", formats: ["iife"], fileName: () => "player.js" } },
    });
    js = readFileSync(join(outDir, "player.js"), "utf8");
    css = baseCss + readdirSync(outDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(join(outDir, name), "utf8")).join("\n");
    writeFileSync(join(outDir, "fixture.css"), css);
    writeFileSync(join(outDir, "README.txt"), "Isolated component fixture: installed project React/CSS/icons, mocked framework and services, synthetic metadata/artwork. Not the complete application or real audio.\n");
});

type Patch = Partial<Record<string, string | boolean | null | number>>;
async function mount(page: Page, kind: "mobile" | "overlay", patch: Patch = {}) {
    // A new document isolates effects and focus listeners from the previous case.
    await page.goto("about:blank");
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="fixture-chrome"><button id="behind">Library fixture</button><h1>Kima Hub</h1><p>Synthetic component preview. Navigation, library and audio are not connected.</p><div class="fixture-card"></div></div><div id="player-root"></div></body></html>');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: js });
    await page.locator("#behind").focus();
    await page.evaluate(({ kind, patch }) => {
        const api = (window as typeof window & { playerQa: { mount: (kind: string, patch: Patch) => void } }).playerQa;
        api.mount(kind, patch);
    }, { kind, patch });
    if (patch.hasMedia !== false) await expect(page.locator(kind === "overlay" ? "[data-overlay-player]" : "[data-mobile-player]")).toBeVisible();
}
async function noOverflow(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const controls = await page.locator("#player-root button:visible").evaluateAll((nodes) => nodes.map((node) => {
        const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height, viewport: innerWidth };
    }));
    for (const r of controls) { expect(r.left).toBeGreaterThanOrEqual(-1); expect(r.right).toBeLessThanOrEqual(r.viewport + 1); expect(r.width).toBeGreaterThanOrEqual(43); expect(r.height).toBeGreaterThanOrEqual(43); }
}

for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    for (const locale of ["en", "nl"]) {
        test(`player surfaces ${width}px ${locale}`, async ({ page }) => {
            const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
            await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
            for (const patch of [{}, { title: "LongOriginalMusicTitle".repeat(18), subtitle: "Original Artist ".repeat(10) }, { cover: null, type: "podcast" }]) {
                await mount(page, "overlay", { ...patch, locale, mobile: width < 768 });
                await noOverflow(page);
            }
            await mount(page, "mobile", { locale, title: "Long original title ".repeat(20) });
            await noOverflow(page);
            expect(errors).toEqual([]);
        });
    }
}

test("short landscape, lyrics, reduced motion and alternate accent", async ({ page }) => {
    for (const size of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        for (const patch of [{ type: "track" }, { type: "podcast" }, { lyrics: true }]) {
            await mount(page, "overlay", patch); await noOverflow(page);
        }
        await mount(page, "mobile"); await noOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mount(page, "overlay", { buffering: true });
    await page.evaluate(() => document.documentElement.style.setProperty("--color-brand", "#67c5b3"));
    expect(await page.locator("[data-overlay-artwork]").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
    await noOverflow(page);
});

test("keyboard focus and playback callbacks remain separate", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mount(page, "overlay", { playing: false });
    await expect(page.getByRole("button", { name: "close", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-overlay-player]'))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "close", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Next track", exact: true }).click();
    await page.getByRole("button", { name: "Sleep timer", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Timer options" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (window as typeof window & { playerQa: { calls: string[] } }).playerQa.calls)).toEqual(["resume", "next", "close"]);
});

test("capture synthetic player previews", async ({ page }, testInfo) => {
    for (const preview of [
        { name: "overlay-desktop", kind: "overlay" as const, width: 1440, height: 960 },
        { name: "overlay-mobile", kind: "overlay" as const, width: 390, height: 844 },
        { name: "mini-mobile", kind: "mobile" as const, width: 390, height: 844 },
    ]) {
        await page.setViewportSize({ width: preview.width, height: preview.height });
        await mount(page, preview.kind, { locale: "nl", mobile: preview.width < 768 });
        await page.waitForTimeout(100);
        const path = testInfo.outputPath(`${preview.name}.png`);
        mkdirSync(resolve(path, ".."), { recursive: true });
        await page.screenshot({ path });
        await testInfo.attach(preview.name, { path, contentType: "image/png" });
    }
});
