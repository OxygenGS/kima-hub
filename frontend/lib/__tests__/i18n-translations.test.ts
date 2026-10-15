import { describe, expect, it } from "vitest";
import { dutch, english, translations, translate } from "../i18n/translations";

describe("UI translations", () => {
    it("contains a Dutch translation for every English UI key", () => {
        expect(Object.keys(dutch).sort()).toEqual(Object.keys(english).sort());
        expect(Object.values(dutch).every(value => value.trim().length > 0)).toBe(true);
    });

    it("keeps the English default and Dutch alternatives available", () => {
        expect(translations.en["Settings"]).toBe("Settings");
        expect(translations.nl["Settings"]).toBe("Instellingen");
        expect(translations.nl["Language"]).toBe("Taal");
        expect(translations.nl["Sign In"]).toBe("Inloggen");
    });
    it("localizes scan and mix actions without rewriting external data", () => {
        expect(translate("nl", "Setting Things Up")).toBe("Bezig met instellen");
        expect(translate("nl", "Syncing audiobooks...")).toBe("Luisterboeken synchroniseren...");
        expect(translate("nl", "Scan failed. You can skip and try again later.")).toContain("Scannen mislukt");
        expect(translate("nl", "Save as Playlist")).toBe("Opslaan als afspeellijst");
        expect(translate("nl", "Added to queue:")).toBe("Toegevoegd aan wachtrij:");
        expect(translate("nl", "My custom mix")).toBe("My custom mix");
    });

    it("translates album and artist interface labels while preserving media metadata", () => {
        expect(translate("nl", "Artist Not Found")).toBe("Artiest niet gevonden");
        expect(translate("nl", "Album not found")).toBe("Album niet gevonden");
        expect(translate("nl", "Downloading...")).toBe("Downloaden...");
        expect(translate("nl", "Start artist radio")).toBe("Artiestenradio starten");
        expect(translate("nl", "An original album title")).toBe("An original album title");
    });

    it("localizes nested album and artist controls", () => {
        expect(translate("nl", "More Like This")).toBe("Meer zoals dit");
        expect(translate("nl", "Add to queue")).toBe("Toevoegen aan wachtrij");
        expect(translate("nl", "Pause preview")).toBe("Voorbeeld pauzeren");
        expect(translate("nl", "Discography")).toBe("Discografie");
        expect(translate("nl", "Psychedelic Rock")).toBe("Psychedelic Rock");
    });

    it("localizes onboarding setup and connection feedback", () => {
        expect(translate("nl", "Create Your Admin Account")).toBe("Maak je beheerdersaccount aan");
        expect(translate("nl", "Connected successfully!")).toBe("Verbinding geslaagd!");
        expect(translate("nl", "URL and API key are required")).toBe("URL en API-sleutel zijn verplicht");
        expect(translate("nl", "Finish without integrations")).toBe("Afronden zonder koppelingen");
        expect(translate("nl", "Soulseek")).toBe("Soulseek");
    });

    it("keeps badge identifiers stable while translating displayed badges", () => {
        expect(translate("nl", "Owned")).toBe("In bezit");
        expect(translate("nl", "Download Album")).toBe("Album downloaden");
        expect(translate("nl", "owned")).toBe("in bezit");
    });

    it("localizes Vibe path, blend and lyrics labels without translating media", () => {
        expect(translate("nl", "Generate Path")).toBe("Route maken");
        expect(translate("nl", "Play Result")).toBe("Resultaat afspelen");
        expect(translate("nl", "No lyrics available")).toBe("Geen songtekst beschikbaar");
        expect(translate("nl", "User playlist title")).toBe("User playlist title");
    });

    it("localizes Vibe map status and fallback labels", () => {
        expect(translate("nl", "Map rendering failed")).toBe("Kaartweergave mislukt");
        expect(translate("nl", "Computing music map")).toBe("Muziekkaart berekenen");
        expect(translate("nl", "Dismiss")).toBe("Sluiten");
    });

    it("translates Galaxy controls but preserves camera-mode and keyboard command values", () => {
        expect(translate("nl", "Recenter")).toBe("Opnieuw centreren");
        expect(translate("nl", "Switch to 3D")).toBe("Overschakelen naar 3D");
        expect(translate("nl", "WASD to move -- Mouse to look -- R for boost -- ESC to exit")).toContain("WASD");
        expect(translate("nl", "Song Path")).toBeTruthy();
    });

    it("translates shared confirmation dialog controls without altering user messages", () => {
        expect(translate("nl", "Confirm")).toBeTruthy();
        expect(translate("nl", "Cancel")).toBeTruthy();
        expect(translate("nl", "Close dialog")).toBe("Dialoogvenster sluiten");
        expect(translate("nl", "Delete playlist named by user")).toBe("Delete playlist named by user");
    });

    it("localizes Soulseek result controls without rewriting search filters or filenames", () => {
        expect(translate("nl", "No Soulseek results found")).toBe("Geen Soulseek-resultaten gevonden");
        expect(translate("nl", "Quality")).toBe("Kwaliteit");
        expect(translate("nl", "Group by user")).toBe("Groeperen per gebruiker");
        expect(translate("nl", "Download file:")).toBe("Bestand downloaden:");
        expect(translate("nl", "FLAC")).toBe("FLAC");
        expect(translate("nl", "Artist - Album.flac")).toBe("Artist - Album.flac");
    });

    it("localizes operation replacement prompts without changing operation IDs", () => {
        const prompt = translate("nl", "Replace {current} with {next}?")
            .replace("{current}", translate("nl", "Vibe"))
            .replace("{next}", translate("nl", "Similar"));
        expect(prompt).toBe("Vervang Vibe door Vergelijkbaar?");
    });

    it("localizes accessible search filters while preserving underlying options", () => {
        expect(translate("nl", "File format:")).toBe("Bestandsformaat:");
        expect(translate("nl", "Sort results by")).toBe("Resultaten sorteren op");
        expect(translate("nl", "FLAC")).toBe("FLAC");
    });

    it("translates route and critical error recovery controls", () => {
        expect(translate("nl", "Something went wrong")).toBe("Er is iets misgegaan");
        expect(translate("nl", "Reload Page")).toBe("Pagina opnieuw laden");
        expect(translate("nl", "Reload Application")).toBe("Applicatie opnieuw laden");
        expect(translate("en", "Application Error")).toBe("Application Error");
        expect(translate("nl", "Raw unexpected API exception")).toBe("Raw unexpected API exception");
    });

    it("preserves external labels when no UI translation exists", () => {
        expect(translate("nl", "Settings")).toBe("Instellingen");
        expect(translate("nl", "Psychedelic Rock")).toBe("Psychedelic Rock");
        expect(translate("nl", "Nieuw genre van provider")).toBe("Nieuw genre van provider");
        expect(translate("en", "Unknown label")).toBe("Unknown label");
        expect(translate("nl", "__proto__")).toBe("__proto__");
    });


    it("translates upstream v1.11 Stats without translating music metadata or period IDs", () => {
        expect(translate("nl", "your listening")).toBe("Je luistergedrag");
        expect(translate("nl", "most played")).toBe("Meest afgespeeld");
        expect(translate("nl", "30 days")).toBe("30 dagen");
        expect(translate("nl", "no plays yet")).toBe("nog niets afgespeeld");
        expect(translate("nl", "play history cleanup")).toBe("Luistergeschiedenis opschonen");
        expect(translate("nl", "top key:")).toBe("Meestvoorkomende toonsoort:");
        expect(translate("nl", "Artist - Original Song")).toBe("Artist - Original Song");
        expect(translate("nl", "30d")).toBe("30d");
        expect(translate("nl", "12mo")).toBe("12mo");
    });

});
