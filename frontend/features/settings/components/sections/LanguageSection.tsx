"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import type { Locale } from "@/lib/i18n/translations";
import { SettingsSection, SettingsRow, SettingsSelect } from "../ui";

/** Each browser stores its own language; no account or database migration is required. */
export function LanguageSection() {
    const { locale, setLocale, t } = useLanguage();

    return (
        <SettingsSection
            id="language"
            title={t("Language")}
            description={t("Choose your display language.")}
        >
            <SettingsRow
                label={t("Display language")}
                description={t("Language changes immediately and is saved in this browser.")}
                htmlFor="language-select"
            >
                <SettingsSelect
                    id="language-select"
                    value={locale}
                    onChange={(value) => setLocale(value as Locale)}
                    options={[
                        { value: "en", label: t("English") },
                        { value: "nl", label: t("Nederlands") },
                    ]}
                />
            </SettingsRow>
        </SettingsSection>
    );
}
