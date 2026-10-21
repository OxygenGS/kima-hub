"use client";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import type { useConnectionTest } from "../../hooks/useConnectionTest";

interface ConnectionTestButtonProps {
    connection: ReturnType<typeof useConnectionTest>;
    disabled: boolean;
}

export function ConnectionTestButton({ connection, disabled }: ConnectionTestButtonProps) {
    const { t, locale } = useLanguage();
    return (
        <div className="inline-flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={connection.test} disabled={disabled}>
                {connection.status === "loading" ? translate(locale, connection.busy) : t("Test Connection")}
            </Button>
            <InlineStatus
                status={connection.status}
                message={translate(locale, connection.message)}
                onClear={connection.clear}
            />
        </div>
    );
}
