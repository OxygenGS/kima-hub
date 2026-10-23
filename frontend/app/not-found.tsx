"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { PageMessage } from "@/components/ui/PageMessage";

export default function NotFound() {
    const { t } = useLanguage();
    return (
        <PageMessage
            title={t("Page not found")}
            description={t("Page not found.")}
            action={{ label: t("Home"), href: "/" }}
        />
    );
}
