"use client";

import { GradientSpinner } from "./GradientSpinner";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message = "Loading..." }: LoadingScreenProps) {
    const { locale } = useLanguage();
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <GradientSpinner size="lg" />
                {message && (
                    <p className="text-white text-sm font-medium">
                        {translate(locale, message)}
                    </p>
                )}
            </div>
        </div>
    );
}
