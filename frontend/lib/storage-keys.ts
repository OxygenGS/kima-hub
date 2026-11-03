// Every localStorage key the audio stack uses. Writers and readers import from here.
export const STORAGE_KEYS = {
    CURRENT_AUDIOBOOK: "kima_current_audiobook",
    CURRENT_PODCAST: "kima_current_podcast",
    PLAYBACK_TYPE: "kima_playback_type",
    CURRENT_INDEX: "kima_current_index",
    IS_SHUFFLE: "kima_is_shuffle",
    REPEAT_MODE: "kima_repeat_mode",
    PLAYER_MODE: "kima_player_mode",
    VOLUME: "kima_volume",
    IS_MUTED: "kima_muted",
    PODCAST_EPISODE_QUEUE: "kima_podcast_episode_queue",
} as const;


/** Playback positions and media identities belong to the signed-in account.
 * Keep device preferences (volume, mute, player mode) when signing out.
 */
export function clearAccountMediaStorage(): void {
    if (typeof window === "undefined") return;
    for (const key of [
        STORAGE_KEYS.CURRENT_AUDIOBOOK,
        STORAGE_KEYS.CURRENT_PODCAST,
        STORAGE_KEYS.PLAYBACK_TYPE,
        STORAGE_KEYS.CURRENT_INDEX,
        STORAGE_KEYS.PODCAST_EPISODE_QUEUE,
    ]) {
        try { window.localStorage.removeItem(key); }
        catch { /* Private browsing and sandboxed frames may block storage. */ }
    }
}
