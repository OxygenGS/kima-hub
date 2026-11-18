"use client";
import { useCallback, useSyncExternalStore } from "react";
export type TextCase = "lowercase" | "original";
export interface UiPreferences { textCase: TextCase; hideBrowse: boolean; }
const KEY = "kima-hub-ui-preferences-v1";
const CHANGE = "kima-hub-ui-preferences-change";
const DEFAULT: UiPreferences = { textCase: "lowercase", hideBrowse: false };
let fallback = DEFAULT;

/** Presentation only: never affects music metadata, permissions or downloads. */
export function readUiPreferences(): UiPreferences {
    if (typeof window === "undefined") return DEFAULT;
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return DEFAULT;
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT;
        return {
            textCase: value.textCase === "original" ? "original" : "lowercase",
            hideBrowse: value.hideBrowse === true,
        };
    } catch {
        return fallback;
    }
}
export function updateUiPreferences(patch: Partial<UiPreferences>): void {
    if (typeof window === "undefined") return;
    const old = readUiPreferences();
    const next: UiPreferences = {
        textCase: patch.textCase === "original" || patch.textCase === "lowercase" ? patch.textCase : old.textCase,
        hideBrowse: typeof patch.hideBrowse === "boolean" ? patch.hideBrowse : old.hideBrowse,
    };
    fallback = next;
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* session-only fallback */ }
    window.dispatchEvent(new Event(CHANGE));
}
function subscribe(listener: () => void): () => void {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGE, listener);
    return () => { window.removeEventListener("storage", listener); window.removeEventListener(CHANGE, listener); };
}
const snapshotCase = (): TextCase => readUiPreferences().textCase;
const snapshotBrowse = (): boolean => readUiPreferences().hideBrowse;
export function useUiPreferences() {
    const textCase = useSyncExternalStore(subscribe, snapshotCase, () => DEFAULT.textCase);
    const hideBrowse = useSyncExternalStore(subscribe, snapshotBrowse, () => DEFAULT.hideBrowse);
    const setTextCase = useCallback((value: TextCase) => updateUiPreferences({ textCase: value }), []);
    const setHideBrowse = useCallback((value: boolean) => updateUiPreferences({ hideBrowse: value }), []);
    return { textCase, hideBrowse, setTextCase, setHideBrowse };
}
