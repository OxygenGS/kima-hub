/** A failed audio provider still uses the user-selected language to explain recovery. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { AudioErrorBoundary } from "@/components/providers/AudioErrorBoundary";

const error = new Error("intentional isolated audio test error");
function BrokenAudio(): React.ReactElement { throw error; }
let host: HTMLDivElement;
let root: Root;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    localStorage.removeItem("kima-hub-language");
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    errorSpy.mockRestore();
});

describe("audio provider error recovery in selected language", () => {
    it("translates the fallback even after a child throws, without restarting audio", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await act(async () => root.render(
            <LanguageProvider><AudioErrorBoundary><BrokenAudio /></AudioErrorBoundary></LanguageProvider>,
        ));
        expect(host.textContent).toContain("Fout in het afspeelsysteem");
        const button = host.querySelector("button");
        expect(button?.textContent).toContain("Opnieuw laden");
        await act(async () => {
            localStorage.setItem("kima-hub-language", "en");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });
        expect(host.textContent).toContain("Playback system error");
        expect(button?.textContent).toContain("Reload");
        expect(error.message).toBe("intentional isolated audio test error");
        // Merely switching language must not activate the reload action.
    });
});
