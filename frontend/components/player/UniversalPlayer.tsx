"use client";

import { useAudio } from "@/lib/audio-context";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { MobilePlayer } from "./MobilePlayer";
import { FullPlayer } from "./FullPlayer";
import { OverlayPlayer } from "./OverlayPlayer";
import { useEffect, useRef } from "react";

export function UniversalPlayer() {
    const { playerMode, setPlayerMode, currentTrack, currentAudiobook, currentPodcast, isPlaying } =
        useAudio();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isMobileOrTablet = isMobile || isTablet;
    const lastMediaIdRef = useRef<string | null>(null);
    const hasAutoSwitchedRef = useRef(false);

    // Auto-switch to overlay mode on mobile/tablet when user starts playing media.
    // Only fires once per mount -- auto-advances don't re-open the overlay.
    useEffect(() => {
        if (!isMobileOrTablet) return;

        const currentMediaId =
            currentTrack?.id ||
            currentAudiobook?.id ||
            currentPodcast?.id ||
            null;

        const mediaChanged = currentMediaId && currentMediaId !== lastMediaIdRef.current;

        if (mediaChanged && isPlaying && !hasAutoSwitchedRef.current) {
            setPlayerMode("overlay");
            hasAutoSwitchedRef.current = true;
        }

        lastMediaIdRef.current = currentMediaId;
    }, [currentTrack?.id, currentAudiobook?.id, currentPodcast?.id, isPlaying, isMobileOrTablet, setPlayerMode]);

    const hasMedia = !!(currentTrack || currentAudiobook || currentPodcast);

    return (
        <>
            {/* The audio element is owned by ConditionalAudioProvider, never by a surface. */}
            {playerMode === "overlay" && hasMedia ? (
                <OverlayPlayer />
            ) : isMobileOrTablet ? (
                <MobilePlayer />
            ) : (
                <FullPlayer />
            )}
        </>
    );
}
