"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { translate, type Locale, type TranslationKey } from "./translations";

const STORAGE_KEY = "kima-hub-language";
const CHANGE_EVENT = "kima-hub-language-change";

function readLocale(): Locale {
    if (typeof window === "undefined") return "en";
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "nl" ? "nl" : "en";
    } catch {
        return "en";
    }
}

function subscribe(listener: () => void): () => void {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGE_EVENT, listener);
    return () => {
        window.removeEventListener("storage", listener);
        window.removeEventListener(CHANGE_EVENT, listener);
    };
}

interface LanguageContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
    // A stable English snapshot on the server avoids hydration differences.
    const locale = useSyncExternalStore(subscribe, readLocale, () => "en" as Locale);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const setLocale = useCallback((next: Locale) => {
        if (next !== "en" && next !== "nl") return;
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
            window.dispatchEvent(new Event(CHANGE_EVENT));
        } catch {
            // Private-browsing restrictions leave the interface in English.
        }
    }, []);

    const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);
    const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
    const context = useContext(LanguageContext);
    if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
    return context;
}
