/** Shared policy for the upcoming opt-in browser DSP and deck transition engine.
 * Does not change any existing playback path by itself.
 */
export type SoundPreset = "flat" | "bass" | "voice" | "warm" | "custom";
export interface SoundLabSettings {
    enabled: boolean;
    preset: SoundPreset;
    lowDb: number;
    midDb: number;
    highDb: number;
    nightMode: boolean;
}
export const FLAT_SOUND: SoundLabSettings = {
    enabled: false, preset: "flat", lowDb: 0, midDb: 0, highDb: 0, nightMode: false,
};
export const SOUND_PRESETS = {
    flat: { lowDb: 0, midDb: 0, highDb: 0 },
    bass: { lowDb: 4, midDb: -1, highDb: 0 },
    voice: { lowDb: -3, midDb: 3, highDb: 1 },
    warm: { lowDb: 2, midDb: 0, highDb: -2 },
} as const;
function db(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(-6, Math.min(6, value)) : 0;
}
export function sanitizeSoundLab(value: unknown): SoundLabSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...FLAT_SOUND };
    const v = value as Record<string, unknown>;
    const preset = v.preset === "bass" || v.preset === "voice" || v.preset === "warm" || v.preset === "custom"
        ? v.preset : "flat";
    const bands = preset === "custom"
        ? { lowDb: db(v.lowDb), midDb: db(v.midDb), highDb: db(v.highDb) }
        : SOUND_PRESETS[preset];
    return { enabled: v.enabled === true, preset, ...bands, nightMode: v.nightMode === true };
}
/** Conservative digital headroom for stacked positive EQ bands.
 * Not a calibrated LUFS normalization or a true peak limiter.
 */
export function eqPreamp(settings: SoundLabSettings): number {
    if (!settings.enabled) return 1;
    const clean = sanitizeSoundLab(settings);
    const boost = Math.max(0, clean.lowDb) + Math.max(0, clean.midDb) + Math.max(0, clean.highDb);
    return Math.pow(10, -boost / 20);
}
/** Constant-sum deck gains: coherent in-phase inputs cannot exceed the
 * unprocessed master gain just because two decks are overlapping.
 */
export function crossfadeGains(progress: number, master: number, muted = false) {
    const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    const gain = muted || !Number.isFinite(master) ? 0 : Math.min(1, Math.max(0, master));
    return { outgoing: gain * (1 - t), incoming: gain * t };
}
export function transitionSeconds(requested: number, outgoingDuration: number, incomingDuration: number): number {
    if (![requested, outgoingDuration, incomingDuration].every(Number.isFinite)) return 0;
    if (requested <= 0 || outgoingDuration < 12 || incomingDuration < 12) return 0;
    return Math.min(requested, 8, outgoingDuration / 4, incomingDuration / 4);
}
