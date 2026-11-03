import { useEffect, useRef } from 'react';
import { useAudio } from "@/lib/audio-context";
import { useIsTV } from '@/lib/tv-utils';

/** Let focused controls, accessibility widgets and browser key combinations win.
 * This prevents space/arrow playback shortcuts from hijacking dialogs, sliders,
 * buttons, text selection or the browser's own shortcuts.
 */
export function shouldIgnorePlaybackShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return true;
  const target = e.target;
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a[href], [contenteditable], ' +
    '[role="button"], [role="slider"], [role="spinbutton"], ' +
    '[role="textbox"], [role="combobox"], [role="menu"], ' +
    '[role="listbox"], [role="dialog"]'
  ));
}

/** Global playback shortcuts; each key is listed at its case below. */
export function useKeyboardShortcuts() {
  const isTV = useIsTV();
  const {
    isPlaying,
    resumeWithGesture,
    pause,
    next,
    previous,
    seek,
    currentTime,
    setVolume,
    volume,
    toggleMute,
    toggleShuffle,
    playbackType,
    currentTrack,
    currentAudiobook,
    currentPodcast,
  } = useAudio();

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const pauseRef = useRef(pause);
  useEffect(() => { pauseRef.current = pause; }, [pause]);

  const resumeWithGestureRef = useRef(resumeWithGesture);
  useEffect(() => { resumeWithGestureRef.current = resumeWithGesture; }, [resumeWithGesture]);

  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; }, [next]);

  const previousRef = useRef(previous);
  useEffect(() => { previousRef.current = previous; }, [previous]);

  const seekRef = useRef(seek);
  useEffect(() => { seekRef.current = seek; }, [seek]);

  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const setVolumeRef = useRef(setVolume);
  useEffect(() => { setVolumeRef.current = setVolume; }, [setVolume]);

  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const toggleMuteRef = useRef(toggleMute);
  useEffect(() => { toggleMuteRef.current = toggleMute; }, [toggleMute]);

  const toggleShuffleRef = useRef(toggleShuffle);
  useEffect(() => { toggleShuffleRef.current = toggleShuffle; }, [toggleShuffle]);

  const currentTrackRef = useRef(currentTrack);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  const currentAudiobookRef = useRef(currentAudiobook);
  useEffect(() => { currentAudiobookRef.current = currentAudiobook; }, [currentAudiobook]);

  const currentPodcastRef = useRef(currentPodcast);
  useEffect(() => { currentPodcastRef.current = currentPodcast; }, [currentPodcast]);

  useEffect(() => {
    // Disable keyboard shortcuts on TV - use remote's media keys instead
    if (isTV) return;

    if (!playbackType) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (shouldIgnorePlaybackShortcut(e)) return;

      switch (e.key.toLowerCase()) {
        case ' ': // Space - Play/Pause
          e.preventDefault();
          if (isPlayingRef.current) {
            pauseRef.current();
          } else {
            resumeWithGestureRef.current();
          }
          break;

        case 'arrowright': // Right arrow - Seek forward 10s
          if (playbackType === 'track' || playbackType === 'audiobook' || playbackType === 'podcast') {
            e.preventDefault();
            const duration = currentTrackRef.current?.duration || currentAudiobookRef.current?.duration || currentPodcastRef.current?.duration || 0;
            seekRef.current(Math.min(currentTimeRef.current + 10, duration));
          }
          break;

        case 'arrowleft': // Left arrow - Seek backward 10s
          if (playbackType === 'track' || playbackType === 'audiobook' || playbackType === 'podcast') {
            e.preventDefault();
            seekRef.current(Math.max(currentTimeRef.current - 10, 0));
          }
          break;

        case 'arrowup': // Up arrow - Volume up 10%
          e.preventDefault();
          setVolumeRef.current(Math.min(volumeRef.current + 0.1, 1));
          break;

        case 'arrowdown': // Down arrow - Volume down 10%
          e.preventDefault();
          setVolumeRef.current(Math.max(volumeRef.current - 0.1, 0));
          break;

        case 'm': // M - Toggle mute
          toggleMuteRef.current();
          break;

        case 'n': // N - Next track
          if (playbackType === 'track') {
            nextRef.current();
          }
          break;

        case 'p': // P - Previous track
          if (playbackType === 'track' && !e.shiftKey) { // Avoid conflict with Shift+P
            previousRef.current();
          }
          break;

        case 's': // S - Toggle shuffle
          if (playbackType === 'track') {
            toggleShuffleRef.current();
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isTV, playbackType]);
}
