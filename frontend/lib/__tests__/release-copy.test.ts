import { describe, expect, it } from "vitest";
import { localizeRelease, localizeReleaseItem } from "../i18n/release-copy";

const consent = {
    kind: "choice" as const,
    key: "gpu.accelerate",
    title: "Use an NVIDIA graphics card",
    summary: "Optional. Run the heaviest job on your graphics card; off unless you turn it on.",
    body: "Original English paragraphs describing how this works.",
    discloses: "Kima downloads twelve pinned packages (about 2 GB) from PyPI, checks every file against a fixed fingerprint, and installs them in your data folder, where they take about 3.4 GB. Nothing about your library leaves your server.",
    defaultValue: false as const,
    requires: "admin" as const,
};
const wipe = {
    kind: "action" as const,
    key: "engine.wipe",
    title: "Wipe and re-run enrichment",
    summary: "The engine is new, so it needs one fresh run. Only its own data is wiped.",
    body: "Everything Kima worked out came from the old engine.",
    cta: "Wipe and re-run",
    run: "wipeEnrichment" as const,
    confirmTitle: "Wipe and re-run enrichment?",
    confirmMessage: "Clears what Kima worked out about your music: which recording each track is, audio analysis, vibe data, the vibe map, artist bios and similar artists. Then it works it all out again with the new engine. Your music, playlists, plays, likes and edits stay. Takes a few hours on a large library; the vibe map is back when it finishes.",
    confirmLabel: "Wipe and re-run",
    olderLibraryOnly: true,
    requires: "admin" as const,
    ifClosed: "Original no-op close warning.",
    links: [{ label: "See progress in Settings", href: "/settings#cache" }],
};
const unknown = {
    kind: "note" as const, key: "ci.original.unknown",
    title: "CI Original Item", summary: "Original generated copy",
    body: "Original item content",
};
const release = {
    version: "1.11.0",
    title: "Kima 1.11",
    summary: "Songs match on sound, feel and genre, there's a new vibe map, the enrichment engine is rebuilt, and Last.fm is gone.",
    date: "2026-10-12",
    note: { from: "Kevin", body: "Original English maintainer letter" },
    items: [consent, wipe, unknown],
};

describe("versioned Dutch release copy", () => {
    it("keeps the original English release and object identity unchanged in English mode", () => {
        expect(localizeRelease(release, "en")).toBe(release);
        expect(localizeReleaseItem("1.11.0", wipe, "en")).toBe(wipe);
    });

    it("translates the complete GPU disclosure while leaving consent off and keys untouched", () => {
        const translated = localizeRelease(release, "nl");
        const gpu = translated.items[0] as typeof consent;
        expect(gpu.title).toBe("Een NVIDIA-videokaart gebruiken");
        expect(gpu.summary).toContain("uit totdat je het zelf inschakelt");
        expect(gpu.body).toContain("twee tot drie keer");
        expect(gpu.discloses).toContain("twaalf vastgepinde pakketten");
        expect(gpu.discloses).toContain("Er worden geen gegevens uit jouw muziekbibliotheek");
        expect(gpu.defaultValue).toBe(false);
        expect(gpu.kind).toBe("choice");
        expect(gpu.key).toBe("gpu.accelerate");
        expect(gpu.requires).toBe("admin");
        expect(consent.discloses).toContain("twelve pinned packages");
    });

    it("does not change what a destructive action does or the link it opens", () => {
        const action = localizeRelease(release, "nl").items[1] as typeof wipe;
        expect(action.title).toBe("Analysegegevens wissen en opnieuw opbouwen");
        expect(action.body).toContain("Je muziekbestanden, afspeellijsten, afspeelbeurten, likes");
        expect(action.confirmMessage).toContain("Je muziekbestanden");
        expect(action.confirmMessage).toContain("blijven behouden");
        expect(action.ifClosed).toContain("niets gewist");
        expect(action.run).toBe("wipeEnrichment");
        expect(action.key).toBe("engine.wipe");
        expect(action.olderLibraryOnly).toBe(true);
        expect(action.links?.[0]?.label).toBe("Voortgang bekijken in Instellingen");
        expect(action.links?.[0]?.href).toBe("/settings#cache");
        expect(localizeReleaseItem("1.11.0", wipe, "nl").confirmTitle).toContain("opnieuw opbouwen");
    });

    it("falls back to current English when a reviewed security warning changes upstream", () => {
        const modified = {
            ...release,
            items: [
                { ...consent, discloses: "New source notice: Kima now transfers library data." },
                { ...wipe, confirmMessage: "New source notice: this action deletes music files." },
            ],
        };
        const translated = localizeRelease(modified, "nl");
        expect(translated.items[0].discloses).toBe(modified.items[0].discloses);
        expect(translated.items[1].confirmMessage).toBe(modified.items[1].confirmMessage);
        expect(translated.items[0].title).toBe("Een NVIDIA-videokaart gebruiken");
        expect(translated.items[1].title).toBe("Analysegegevens wissen en opnieuw opbouwen");
    });

    it("preserves the author's attribution while translating the text for known 1.11", () => {
        const translated = localizeRelease(release, "nl");
        expect(translated.note?.from).toBe("Kevin");
        expect(translated.note?.body).toContain("Mijn aandacht gaat naar Kima");
        expect(translated.note?.body).toContain("je muziek, afspeellijsten");
        expect(release.note.body).toBe("Original English maintainer letter");
        expect(translated.date).toBe("2026-10-12");
        expect(translated.version).toBe("1.11.0");
    });

    it("leaves unknown items, versions and server-supplied data exactly as received", () => {
        const nl = localizeRelease(release, "nl");
        expect(nl.items[2]).toBe(unknown);
        expect(localizeRelease({ ...release, version: "1.12.0" }, "nl").items[0]).toBe(consent);
        expect(localizeRelease({ ...release, version: "1.12.0" }, "nl").note).toBe(release.note);
        expect(localizeRelease({ ...release, title: "CI Dynamic Server Title" }, "nl").title).toBe("CI Dynamic Server Title");
        expect(localizeRelease({ ...release, note: { from: "Another author", body: "Untouched" } }, "nl").note?.body).toBe("Untouched");
    });

    it("keeps the 1.11 retired-mix reminder translated without changing actions", () => {
        const reminder = localizeRelease({
            version: "1.11.0",
            title: "One thing left from 1.11",
            summary: "Your old mood mix is still waiting for an answer.",
            items: [
                { kind: "action" as const, key: "moods.mixes.retired",
                  title: "Your old mood mix", summary: "Original summary",
                  body: "Original explanation", cta: "Save as playlist",
                  ifClosed: "Original close behavior", requires: "retiredMoodMix" as const },
            ],
        }, "nl");
        expect(reminder.title).toBe("Nog één punt uit 1.11");
        expect(reminder.summary).toContain("wacht nog op een keuze");
        expect(reminder.items[0].cta).toBe("Opslaan als afspeellijst");
        expect(reminder.items[0].requires).toBe("retiredMoodMix");
        expect(reminder.items[0].ifClosed).toContain("De volgende keer");
    });

    it("provides a complete Dutch 1.10.1 history explanation and retains its link route", () => {
        const translated = localizeRelease({
            version: "1.10.1",
            title: "What counts as a play",
            summary: "Play counts now track what you've listened to, not what started loading. There's a one-off cleanup for the counts you've already got.",
            items: [
                { key: "plays.rule", title: "A play means you listened", summary: "rule", body: "rule content" },
                { key: "plays.repair", title: "Clean up old play counts", summary: "cleanup", body: "cleanup content",
                  links: [{ label: "Open the cleanup", href: "/stats#false-starts" }] },
            ],
        }, "nl");
        expect(translated.title).toBe("Wat telt als afspeelbeurt");
        expect(translated.items[0].body).toContain("vier minuten");
        expect(translated.items[1].body).toContain("Je muziekbestanden worden nooit aangeraakt");
        expect(translated.items[1].links?.[0]?.href).toBe("/stats#false-starts");
        expect(translated.items[1].links?.[0]?.label).toBe("Open de opschoonfunctie");
    });

    it("covers all 1.11 catalog item codes with editorial translations", () => {
        const keys = [
            "engine.wipe", "vibe.engine", "vibe.map", "engine.rebuilt", "moods.fixed",
            "moods.mixes", "moods.mixes.retired", "stats.page", "lastfm.gone", "gpu.accelerate",
        ];
        for (const key of keys) {
            const source = { key, title: "Original", summary: "Original", body: "Original" };
            const result = localizeReleaseItem("1.11.0", source, "nl");
            expect(result.title, key).not.toBe("Original");
            expect(result.summary, key).not.toBe("Original");
            expect(result.body, key).not.toBe("Original");
        }
    });
});
