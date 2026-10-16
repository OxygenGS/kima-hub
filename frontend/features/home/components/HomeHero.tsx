"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { useLanguage } from "@/lib/i18n/language-context";

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
};

export function HomeHero() {
    const { t } = useLanguage();
    const greeting = getGreeting();

    return <PageHeader eyebrow={t("Home")} title={t(greeting)} description={t("Your library at a glance")} />;
}
