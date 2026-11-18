"use client";
import { useCallback, useSyncExternalStore } from "react";

export const AUDIOBOOK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type AudiobookSpeed = typeof AUDIOBOOK_SPEEDS[number];
const STORAGE_KEY = "kima-hub-audiobook-speed-v1";
const CHANGE_EVENT = "kima-hub-audiobook-speed-change";
let temporarySpeed: AudiobookSpeed = 1;

export function isAudiobookSpeed(value: number): value is AudiobookSpeed {
    return AUDIOBOOK_SPEEDS.some(speed => speed === value);
}
export function readAudiobookSpeed(): AudiobookSpeed {
    if (typeof window === "undefined") return 1;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return 1;
        const value = Number(raw);
        return isAudiobookSpeed(value) ? value : 1;
    } catch { return temporarySpeed; }
}
export function setAudiobookSpeed(value: AudiobookSpeed): void {
    if (typeof window === "undefined" || !isAudiobookSpeed(value)) return;
    temporarySpeed = value;
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); }
    catch { /* Keep the speed for this session if local storage is blocked. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}
function subscribe(listener: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener("storage", listener);
    return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", listener); };
}
export function useAudiobookSpeed() {
    const speed = useSyncExternalStore(subscribe, readAudiobookSpeed, () => 1 as AudiobookSpeed);
    const update = useCallback((value: AudiobookSpeed) => setAudiobookSpeed(value), []);
    return { speed, setSpeed: update };
}
