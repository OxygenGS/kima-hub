"use client";

import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { PageMessage } from "@/components/ui/PageMessage";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const { t } = useLanguage();
    useEffect(() => {
        console.error("Route error:", error);
    }, [error]);

    return (
        <PageMessage
            title={t("something went wrong")}
            action={{ label: t("try again"), onClick: reset }}
        />
    );
}
