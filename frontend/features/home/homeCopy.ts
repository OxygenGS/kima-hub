import type { Locale } from "@/lib/i18n/translations";

/** Presentation-only copy; library metadata and route identifiers stay untouched. */
const english = {
    eyebrow: "Your music, your space",
    headline: "Make room for a good listen.",
    description: "Rediscover a favourite, find a new direction, or pick up where you left off.",
    collection: "Open collection",
    discover: "Discover music",
    shelf: "From your collection",
    emptyTitle: "A home for your music.",
    emptyDescription: "Your artists will appear here as your collection grows.",
    shortcuts: "Explore your music",
    albums: "Albums",
    albumsDescription: "A whole record. A different world.",
    tracks: "Tracks",
    tracksDescription: "Go straight to your favourites.",
    vibe: "Vibe Map",
    vibeDescription: "Follow the way your music feels.",
    radio: "Radio",
    radioDescription: "Pick a station. Keep listening.",
};

type HomeCopy = { [K in keyof typeof english]: string };

const dutch: HomeCopy = {
    eyebrow: "Jouw muziek, jouw plek",
    headline: "Tijd voor iets goeds.",
    description: "Herontdek een favoriet, vind iets nieuws of luister verder waar je gebleven was.",
    collection: "Open bibliotheek",
    discover: "Ontdek muziek",
    shelf: "Uit jouw bibliotheek",
    emptyTitle: "Een thuis voor je muziek.",
    emptyDescription: "Je artiesten verschijnen hier zodra je bibliotheek groeit.",
    shortcuts: "Verken je muziek",
    albums: "Albums",
    albumsDescription: "Een heel album. Een andere wereld.",
    tracks: "Nummers",
    tracksDescription: "Meteen naar je favorieten.",
    vibe: "Sfeermap",
    vibeDescription: "Volg het gevoel van je muziek.",
    radio: "Radio",
    radioDescription: "Kies een station. Blijf luisteren.",
};

export function getHomeCopy(locale: Locale): HomeCopy {
    return locale === "nl" ? dutch : english;
}
