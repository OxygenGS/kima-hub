/**
 * Versioned Dutch in-app release translation draft (editorial sign-off pending).
 *
 * The upstream source of truth stays in backend/src/services/releases/catalog.ts.
 * Only presentation fields are projected here; stable release versions, item
 * keys, kind, run commands, defaultValue, requires and link destinations are
 * never localized. Future/unknown versions and items fall back to the original
 * English supplied by the server.
 */
import type { Locale } from "./translations";

interface LinkCopy {
    label: string;
    href: string;
}
interface ReleaseItemForCopy {
    key: string;
    title: string;
    summary: string;
    body: string;
    links?: LinkCopy[];
}
interface ReleaseForCopy {
    version: string;
    title: string;
    summary: string;
    note?: { from: string; body: string };
    items: ReleaseItemForCopy[];
}
interface ItemCopy {
    title?: string;
    summary?: string;
    body?: string;
    cta?: string;
    confirmTitle?: string;
    confirmMessage?: string;
    confirmLabel?: string;
    ifClosed?: string;
    discloses?: string;
    /** Text by stable route URL: the href itself is never changed. */
    links?: Record<string, string>;
}
interface VersionCopy {
    /** Only known exact English titles are replaced, not arbitrary server text. */
    titles: Record<string, string>;
    summaries: Record<string, string>;
    noteBody?: string;
    items: Record<string, ItemCopy>;
}

const dutch: Record<string, VersionCopy> = {
    "1.11.0": {
        titles: {
            "One thing left from 1.11": "Nog één punt uit 1.11",
        },
        summaries: {
            "Songs match on sound, feel and genre, there's a new vibe map, the enrichment engine is rebuilt, and Last.fm is gone.":
                "Nummers worden nu gematcht op geluid, sfeer en genre. Er is een nieuwe sfeermap, de analyse-engine is vernieuwd en Last.fm is verwijderd.",
            "Your old mood mix is still waiting for an answer.":
                "Je oude sfeermix wacht nog op een keuze.",
        },
        // Kevin's personal message is translated faithfully; it is not a
        // system-generated consent request, and the author attribution remains.
        noteBody: [
            "Hé allemaal.",
            "Ik weet dat updates lang op zich hebben laten wachten. Ben je blijven hangen? Bedankt. Installeer je Kima voor het eerst, dan heb je een mooi moment gekozen.",
            "Sinds de lancering van Kima is er gek genoeg veel ellende geweest. Kort na elkaar zijn dierbaren in de familie overleden, waren er noodgevallen met dieren waardoor we 's nachts bij de dierenarts zaten, en natuurlijk is er de ellende van de Amerikaanse bedrijfscultuur. Ik heb ook ADHD: ik kan me zo sterk op iets vastbijten dat ik daarna besef dat ik mijn grote jongen heb verwaarloosd. Daar maak ik nu een einde aan. Mijn aandacht gaat naar Kima: de mobiele app en vooral de sfeer-engine.",
            "Ondanks alles heb ik aan Kima v2 gewerkt. Deze vernieuwde analyse-engine is fase 1. Voor deze update moeten de oude analysegegevens volledig worden gewist en opnieuw opgebouwd. Alleen gegevens van de engine worden gewist; je muziek, afspeellijsten, afspeelbeurten en likes blijven precies zoals ze zijn. Ik denk dat je blij zult zijn met het resultaat.",
            "Het plan is Kima modulair te maken, met een modulewinkel. De basisapp blijft draaien om muziek en sfeer. Al het andere — luisterboeken, podcasts en toekomstige uitbreidingen — komt uit die winkel. Zo bepaal je zelf wat jouw Kima bevat. Mensen hebben gevraagd of ze luisterboeken kunnen weglaten; dat wordt mogelijk. En ik wil ruimte bieden om zelf modules te publiceren die anderen kunnen installeren.",
            "Ben je gebleven, roep je soms gefrustreerd tegen de app (dat doe ik ook) maar houd je toch vol: ik hou van jullie. Nogmaals bedankt. Ik hoop dat deze update jullie een goed gevoel geeft. Dat kunnen we in deze wereld gebruiken.",
        ].join("\n\n"),
        items: {
            "engine.wipe": {
                title: "Analysegegevens wissen en opnieuw opbouwen",
                summary: "De engine is vernieuwd en moet één keer opnieuw draaien. Alleen de eigen analysegegevens worden gewist.",
                body: [
                    "Alles wat Kima over je muziek heeft berekend, komt uit de oude engine. Met deze actie worden de resultaten daarvan gewist: audioanalyse, sfeergegevens, de sfeermap, artiestenbiografieën en vergelijkbare artiesten. Daarna analyseert de nieuwe engine je volledige bibliotheek opnieuw.",
                    "Je muziekbestanden, afspeellijsten, afspeelbeurten, likes en handmatige bewerkingen blijven behouden. De nieuwe analyse draait op de achtergrond en kan bij een grote bibliotheek enkele uren duren. Daarna verschijnt de sfeermap weer.",
                ].join("\n\n"),
                cta: "Wissen en opnieuw analyseren",
                confirmTitle: "Analysegegevens wissen en opnieuw opbouwen?",
                confirmMessage: "Dit wist wat Kima over je muziek heeft berekend: de identiteit van opnamen, audioanalyse, sfeergegevens, de sfeermap, artiestenbiografieën en vergelijkbare artiesten. Vervolgens berekent de nieuwe engine alles opnieuw. Je muziekbestanden, afspeellijsten, afspeelbeurten, likes en bewerkingen blijven behouden. Bij een grote bibliotheek kan dit enkele uren duren. De sfeermap komt terug zodra de verwerking klaar is.",
                confirmLabel: "Analysegegevens wissen en opnieuw opbouwen",
                ifClosed: "Als je nu sluit, wordt niets gewist. Je kunt deze actie ook vinden bij Instellingen, onder Bibliotheekverrijking.",
                links: { "/settings#cache": "Voortgang bekijken in Instellingen" },
            },
            "vibe.engine": {
                title: "De nieuwe sfeer-engine",
                summary: "Nummers worden nu gematcht op hun geluid, sfeer en de genres van hun artiest.",
                body: [
                    "Voorheen matchte Kima nummers alleen op geluid. Nu weegt iedere match drie zaken mee: hoe het nummer klinkt, hoe het aanvoelt (rustig of intens, licht of donker, vergeleken met de rest van je bibliotheek) en de genres van de artiest. Die genres tellen alleen mee bij het vergelijken van verschillende artiesten.",
                    "Vergelijkbare nummers, Song Path, Blend en aanbevelingen gebruiken dit allemaal. Een lijst bevat maximaal twee nummers van hetzelfde album en vier van dezelfde artiest. Zoeken met woorden blijft alleen het geluid vergelijken, omdat een zin geen sfeer of genre heeft.",
                    "Elke weging is vóór invoering getoetst aan hoe mensen muziek beoordelen.",
                ].join("\n\n"),
                links: { "/vibe": "Open de sfeermap" },
            },
            "vibe.map": {
                title: "De nieuwe sfeermap",
                summary: "Je bibliotheek in kaart gebracht door de sfeer-engine. De kaart is van jou en verschuift niet telkens.",
                body: [
                    "Elk nummer krijgt een plaats op de kaart op basis van de sfeer-engine. Nummers die bij elkaar passen, staan dicht bij elkaar. Achter de kaart zie je een heel zachte gloed en enkele verre sterren voor diepte.",
                    "Je kaart wordt één keer ingedeeld nadat de bibliotheek is geanalyseerd. Nieuwe nummers krijgen een plaats tussen de bestaande nummers en behouden die. Als je de analysegegevens wist en opnieuw opbouwt, wordt ook de hele kaart opnieuw ingedeeld.",
                ].join("\n\n"),
                links: { "/vibe": "Open de sfeermap" },
            },
            "engine.rebuilt": {
                title: "Vernieuwde analyse-engine",
                summary: "Betere identificatie, geen verzonnen meetwaarden en een lichtere analyser.",
                body: [
                    "Kima identificeert nummers eerst aan de hand van tags en bestandsnamen en vergelijkt die met de muziek die je daadwerkelijk bezit. Audiofingerprinting wordt alleen gebruikt als die informatie onvoldoende is.",
                    "De analysers rapporteren uitsluitend wat echt is gemeten. Wat niet kan worden vastgesteld, blijft leeg in plaats van dat er een waarde wordt gegokt.",
                    "Alles draait nu op ONNX Runtime: zowel de geluidsvectoren als de audioanalyse. PyTorch wordt nergens meer gebruikt. Dat maakt de engine lichter. Met een instelling kun je zware taken naar een NVIDIA-videokaart verplaatsen als Kima die herkent. De volledige engine bouwt en draait rechtstreeks op x86 en ARM. Ook Macs met Apple Silicon krijgen dus de volledige analyse, niet een uitgeklede versie.",
                ].join("\n\n"),
            },
            "moods.fixed": {
                title: "Sferen gecorrigeerd",
                summary: "Sommige sferen werden omgekeerd herkend. Dat is opgelost. Er zijn nu vijf sferen.",
                body: [
                    "Rustige nummers konden bij Intens terechtkomen en verdrietige nummers bij Opgewekt. Dat is gecorrigeerd.",
                    "Er zijn nu vijf sferen: Opgewekt, Melancholisch, Rustig, Intens en Energiek. Akoestisch en elektronisch zijn geen afzonderlijke sferen meer. Ze maten deels hetzelfde en verdrongen daardoor andere eigenschappen. Energie stapelt zich ook niet meer bovenaan op: voorheen kreeg ongeveer een derde van een bibliotheek de hoogste energiewaarde.",
                ].join("\n\n"),
            },
            "moods.mixes": {
                title: "Je sfeermix",
                summary: "Je mix is gemaakt met de oude sferen. Maak hem opnieuw, behoud hem of sla hem op als afspeellijst.",
                body: [
                    "Je opgeslagen sfeermix is samengesteld met de oude, onjuiste sferen. Met Opnieuw maken wis je die mix, zodat je op de startpagina met de Sfeermixer een nieuwe kunt maken. Met Behouden blijft de bestaande mix ongewijzigd.",
                    "Wil je de nummers hoe dan ook bewaren? Sla de mix dan eerst op als afspeellijst.",
                ].join("\n\n"),
                cta: "Opnieuw maken",
                ifClosed: "Als je nu sluit, blijft je sfeermix ongewijzigd.",
            },
            "moods.mixes.retired": {
                title: "Je oude sfeermix",
                summary: "De bijbehorende sfeer bestaat niet meer. Sla de mix op als afspeellijst of verwijder hem.",
                body: [
                    "Je opgeslagen sfeermix is gemaakt met een sfeer die niet meer bestaat. Daarom kan Kima hem niet meer tonen. Alle nummers staan nog in je bibliotheek.",
                    "Sla hem op als afspeellijst om de nummers bij elkaar te houden, of verwijder de mix. Er wordt niets verwijderd totdat je zelf een keuze maakt.",
                ].join("\n\n"),
                cta: "Opslaan als afspeellijst",
                ifClosed: "Als je nu sluit, wordt niets verwijderd. De volgende keer wordt deze vraag opnieuw gesteld.",
            },
            "stats.page": {
                title: "Statistieken",
                summary: "Bekijk wat je echt beluistert. Ook de speler toont nu het aantal afspeelbeurten.",
                body: [
                    "De pagina Statistieken toont welke nummers je het vaakst opnieuw beluistert, welke artiesten het grootste deel van je luistergedrag bepalen en welk deel van je bibliotheek je nog nooit hebt afgespeeld. Je kunt kiezen voor de afgelopen 30 dagen, 12 maanden of de volledige periode.",
                    "De volledige speler laat zien hoe vaak je het huidige nummer hebt afgespeeld.",
                ].join("\n\n"),
                links: { "/stats": "Open Statistieken" },
            },
            "lastfm.gone": {
                title: "Geen accounts, geen sleutels",
                summary: "Last.fm is verdwenen. Aanmelden of configureren is niet nodig.",
                body: [
                    "Vergelijkbare artiesten komen van ListenBrainz, met Deezer als reservebron. Namen komen van MusicBrainz, artiestenbiografieën van Wikidata en albumhoezen van Deezer en Cover Art Archive. Hiervoor heb je geen account of API-sleutel nodig.",
                    "ListenBrainz wordt aanbevolen voor populariteitsgegevens, maar is niet verplicht. Als je daar een account maakt en scrobbling inschakelt, schakelt Kima voor populariteit automatisch over naar jouw ListenBrainz-gegevens. Tot die tijd vult Deezer die aan.",
                ].join("\n\n"),
            },
            "gpu.accelerate": {
                title: "Een NVIDIA-videokaart gebruiken",
                summary: "Optioneel: voer de zwaarste taak uit op je videokaart. Dit staat uit totdat je het zelf inschakelt.",
                body: [
                    "Het berekenen van sfeergegevens is de zwaarste taak van Kima. Als je server Linux draait en Kima een NVIDIA-videokaart herkent, kan die kaart dit werk overnemen. Met een hoog ingestelde werker-schuifregelaar gaat dit ongeveer twee tot drie keer zo snel. Je processor blijft dan vrij voor andere taken.",
                    "Je kunt deze optie ook tijdens een lopende analyse inschakelen. De instelling is op elk moment te wijzigen bij Instellingen, onder Bibliotheekverrijking.",
                ].join("\n\n"),
                discloses: "Kima downloadt twaalf vastgepinde pakketten (ongeveer 2 GB) van PyPI, controleert elk bestand aan de hand van een vaste vingerafdruk en installeert ze in je gegevensmap, waar ze ongeveer 3,4 GB ruimte innemen. Er worden geen gegevens uit jouw muziekbibliotheek van de server verstuurd.",
            },
        },
    },
    "1.10.1": {
        titles: { "What counts as a play": "Wat telt als afspeelbeurt" },
        summaries: {
            "Play counts now track what you've listened to, not what started loading. There's a one-off cleanup for the counts you've already got.":
                "Afspeelbeurten tellen voortaan wat je hebt beluisterd, niet wat alleen begon te laden. Je kunt eerdere tellingen eenmalig opschonen.",
        },
        items: {
            "plays.rule": {
                title: "Een afspeelbeurt betekent dat je hebt geluisterd",
                summary: "Een nummer telt mee zodra je de helft of vier minuten hebt gehoord.",
                body: "Vroeger telde Kima een afspeelbeurt zodra een nummer begon te laden. Daardoor telde snel door een album bladeren elk nummer mee. Nu telt een nummer pas als je de helft of vier minuten hebt beluisterd, afhankelijk van wat het eerst wordt bereikt. Last.fm en ListenBrainz gebruiken dezelfde regel. Nummers van dertig seconden of korter tellen nooit mee.",
            },
            "plays.repair": {
                title: "Oude afspeelbeurten opschonen",
                summary: "Zoek overgeslagen nummers die onterecht meetelden en verwijder die tellingen.",
                body: [
                    "Oude afspeeltellingen bevatten mogelijk nog zulke overgeslagen nummers. Een hulpmiddel op de pagina Statistieken zoekt naar afspeelbeurten die enkele seconden later werden gevolgd door een andere afspeelbeurt. Je kunt ieder geval bekijken en ervoor kiezen de telling te verwijderen of te behouden.",
                    "Het hulpmiddel verwijdert alleen wat aantoonbaar is overgeslagen. Je muziekbestanden worden nooit aangeraakt.",
                ].join("\n\n"),
                links: { "/stats#false-starts": "Open de opschoonfunctie" },
            },
        },
    },
};

/**
 * Consent notices and destructive confirmations must never display an obsolete
 * translation if upstream changes what is sent or deleted. These expected
 * English originals are pinned to the released 1.11 catalog; a mismatch
 * intentionally falls back to the new original English warning until its translation is updated and checked.
 */
const sourcePinnedSafetyCopy: Record<string, Record<string, Partial<Record<"discloses" | "confirmMessage", string>>>> = {
    "1.11.0": {
        "engine.wipe": {
            confirmMessage:
                "Clears what Kima worked out about your music: which recording each track is, audio analysis, vibe data, the " +
                "vibe map, artist bios and similar artists. Then it works it all out again with the new engine. Your music, playlists, plays, likes and edits stay. " +
                "Takes a few hours on a large library; the vibe map is back when it finishes.",
        },
        "gpu.accelerate": {
            discloses:
                "Kima downloads twelve pinned packages (about 2 GB) from PyPI, checks every file against a fixed " +
                "fingerprint, and installs them in your data folder, where they take about 3.4 GB. Nothing about " +
                "your library leaves your server.",
        },
    },
};

/**
 * Translate only the in-app editorial *display fields*. Saved decisions,
 * API identifiers, authorization flags, commands and link URLs are returned
 * unchanged. Missing/unknown content retains the server's English source.
 */
export function localizeRelease<T extends ReleaseForCopy>(release: T, locale: Locale): T {
    if (locale !== "nl") return release;
    const copy = dutch[release.version];
    if (!copy) return release;

    const items = release.items.map((item) => {
        const itemCopy = copy.items[item.key];
        if (!itemCopy) return item;
        const { links: translatedLinks, ...display } = itemCopy;
        const originalFields = item as unknown as Record<string, unknown>;
        const safetyCopy = sourcePinnedSafetyCopy[release.version]?.[item.key];
        const safeDisplay = Object.fromEntries(
            Object.entries(display).filter(([field]) => {
                const source = originalFields[field];
                // Never introduce an optional field the server did not send.
                if (typeof source !== "string") return false;
                if (field === "discloses" || field === "confirmMessage") {
                    // A missing review baseline must also fail closed.
                    return source === safetyCopy?.[field];
                }
                return true;
            }),
        );
        return {
            ...item,
            ...safeDisplay,
            links: item.links
                ? item.links.map((link) => ({
                      ...link,
                      label: translatedLinks?.[link.href] ?? link.label,
                  }))
                : item.links,
        };
    });

    return {
        ...release,
        title: copy.titles[release.title] ?? release.title,
        summary: copy.summaries[release.summary] ?? release.summary,
        note: release.note && copy.noteBody && release.note.from === "Kevin"
            ? { ...release.note, body: copy.noteBody }
            : release.note,
        items,
    } as T;
}

/** Helper used by the release gate for a destructive action confirmation. */
export function localizeReleaseItem<T extends ReleaseForCopy["items"][number]>(
    version: string,
    item: T,
    locale: Locale,
): T {
    const translated = localizeRelease({
        version,
        title: "",
        summary: "",
        items: [item],
    }, locale);
    return translated.items[0] as T;
}
