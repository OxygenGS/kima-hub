"use client";
import { useEffect } from "react";
import { useUiPreferences } from "@/lib/ui-preferences";

/** Apply the user's browser preference even when Settings Studio is closed. */
export function UiPreferencesBridge() {
    const { textCase } = useUiPreferences();
    useEffect(() => {
        document.documentElement.dataset.textCase = textCase;
        return () => { delete document.documentElement.dataset.textCase; };
    }, [textCase]);
    return null;
}
