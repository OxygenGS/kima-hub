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

    it("preserves external labels when no UI translation exists", () => {
        expect(translate("nl", "Settings")).toBe("Instellingen");
        expect(translate("nl", "Psychedelic Rock")).toBe("Psychedelic Rock");
        expect(translate("nl", "Nieuw genre van provider")).toBe("Nieuw genre van provider");
        expect(translate("en", "Unknown label")).toBe("Unknown label");
        expect(translate("nl", "__proto__")).toBe("__proto__");
    });

});
