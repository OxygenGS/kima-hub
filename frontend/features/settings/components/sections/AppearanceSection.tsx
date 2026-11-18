"use client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useUiPreferences } from "@/lib/ui-preferences";
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggle } from "../ui";

const copy = {
    en: {
        title: "Appearance", description: "Personalize Kima in this browser. Changes apply immediately.",
        casing: "Text capitalization", casingHelp: "Show music names as stored or use the lowercase look.",
        lower: "All lowercase", original: "Original capitalization",
        browse: "Show Browse in desktop navigation",
        browseHelp: "Hiding the shortcut does not disable Browse or invalidate bookmarked pages.",
    },
    nl: {
        title: "Weergave", description: "Stel Kima in voor deze browser. Wijzigingen zijn direct zichtbaar.",
        casing: "Hoofdletters in teksten", casingHelp: "Toon muzieknamen zoals opgeslagen of kies alleen kleine letters.",
        lower: "Alles in kleine letters", original: "Originele hoofdletters",
        browse: "Toon Bladeren in het bureaubladmenu",
        browseHelp: "De snelkoppeling verbergen schakelt Bladeren of opgeslagen bladwijzers niet uit.",
    },
} as const;

export function AppearanceSection() {
    const { locale } = useLanguage();
    const t = copy[locale];
    const { textCase, setTextCase, hideBrowse, setHideBrowse } = useUiPreferences();
    return (
        <SettingsSection id="appearance" title={t.title} description={t.description}>
            <SettingsRow label={t.casing} description={t.casingHelp} htmlFor="text-capitalization">
                <SettingsSelect id="text-capitalization" value={textCase}
                    onChange={value => { if (value === "original" || value === "lowercase") setTextCase(value); }}
                    options={[{ value: "lowercase", label: t.lower }, { value: "original", label: t.original }]} />
            </SettingsRow>
            <SettingsRow label={t.browse} description={t.browseHelp} htmlFor="show-browse-nav">
                <SettingsToggle id="show-browse-nav" label={t.browse} checked={!hideBrowse}
                    onChange={visible => setHideBrowse(!visible)} />
            </SettingsRow>
        </SettingsSection>
    );
}
