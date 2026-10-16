"use client";

import { ReactNode } from "react";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/language-context";

/** Catches errors in the audio providers so the rest of the app keeps running. */
export function AudioErrorBoundary({ children }: { children: ReactNode }) {
    const { t } = useLanguage();
    return (
        <ErrorBoundary
            label="AudioErrorBoundary"
            renderFallback={() => (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <p className="text-[var(--text-secondary)]">{t("Playback system error")}</p>
                    <Button variant="primary" onClick={() => window.location.reload()}>
                        {t("Reload")}
                    </Button>
                </div>
            )}
        >
            {children}
        </ErrorBoundary>
    );
}
