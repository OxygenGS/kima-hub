import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: { getLibraryDoctorReport: vi.fn() },
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (label: string) => label }),
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import { api, type LibraryDoctorReport } from "@/lib/api";
import { LibraryDoctorSection } from "./LibraryDoctorSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const report: LibraryDoctorReport = {
    generatedAt: "2026-11-02T12:00:00.000Z",
    basis: "indexed-metadata",
    sampleLimit: 8,
    counts: {
        libraryTracks: 1000,
        missingTracks: 2,
        corruptTracks: 1,
        albumsWithoutCover: 3,
        artistsWithoutImage: 4,
        importsToReview: 1,
    },
    samples: {
        missingTracks: [],
        importsToReview: [{
            id: "import-1", title: "Dance Monkey", album: "Unknown Album",
            artist: "Unknown Artist",
            filePath: "Singles/Kima Downloads/Tones and I/Unknown Album/02.flac",
        }],
    },
};

async function clickCheck() {
    await act(async () => {
        host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<LibraryDoctorSection />));
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("Library Doctor settings UI", () => {
    it("does not run any report automatically when Settings opens", () => {
        expect(host.textContent).toContain("Library Doctor");
        expect(host.textContent).toContain("Run library check");
        expect(api.getLibraryDoctorReport).not.toHaveBeenCalled();
    });

    it("loads the report on demand and shows suspected Soulseek imports as review candidates", async () => {
        vi.mocked(api.getLibraryDoctorReport).mockResolvedValueOnce(report);
        await clickCheck();
        expect(api.getLibraryDoctorReport).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("Indexed library tracks");
        expect(host.textContent).toContain("1,000");
        expect(host.textContent).toContain("Dance Monkey");
        expect(host.textContent).toContain("Review candidates are not confirmed errors");
    });

    it("shows an error instead of a fictitious zero-problem report", async () => {
        vi.mocked(api.getLibraryDoctorReport).mockRejectedValueOnce(new Error("offline"));
        await clickCheck();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("Library check failed");
        expect(host.textContent).not.toContain("Indexed library tracks");
    });
});
