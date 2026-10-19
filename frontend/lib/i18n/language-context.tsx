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

// Browsers that refuse localStorage can still change language for this tab.
// The preference is intentionally not persisted when storage is unavailable.
let memoryLocale: Locale = "en";

function readLocale(): Locale {
    if (typeof window === "undefined") return "en";
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "nl" ? "nl" : "en";
    } catch {
        return memoryLocale;
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

/** Locale from browser storage, available even outside LanguageProvider. */
export function useStoredLocale(): Locale {
    return useSyncExternalStore(subscribe, readLocale, () => "en" as Locale);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    // A stable English snapshot on the server avoids hydration differences.
    const locale = useStoredLocale();

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const setLocale = useCallback((next: Locale) => {
        if (next !== "en" && next !== "nl") return;
        memoryLocale = next;
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // The choice remains active in this tab even if storage is blocked.
        }
        window.dispatchEvent(new Event(CHANGE_EVENT));
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
