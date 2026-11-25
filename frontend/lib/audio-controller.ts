"use client";

import { STORAGE_KEYS } from "./storage-keys";
import { SoundLabSession } from "./sound-lab-session";
import { crossfadeGains, transitionSeconds } from "./sound-lab-policy";
import type {
    EngineStatus,
    TimerId,
    EngineSnapshot,
    EngineEvent,
    Effect,
} from "./audio-engine-policy";
import { initialSnapshot, transition } from "./audio-engine-policy";

type ListenerStore = Array<{ event: string; handler: EventListener }>;

type ExternalEvent = "ended" | "timeupdate" | "canplay" | "seeked" | "error" | "gapless-advance";
type ExternalCallback = (data?: unknown) => void;

const TICKER_INTERVAL_MS = 1000;
const FADE_TICK_MS = 50;

interface DeckTransition {
    outgoing: HTMLAudioElement;
    incoming: HTMLAudioElement;
    generation: number;
    trackId: string;
    requested: number;
    outgoingStart: number;
    incomingStart: number;
    seconds: number;
    startedAt: number;
    ready: boolean;
    progress: number;
    timer: ReturnType<typeof setInterval> | null;
}

function listenerAdder(el: HTMLAudioElement, store: ListenerStore) {
    return (event: string, handler: EventListener) => {
        el.addEventListener(event, handler);
        store.push({ event, handler });
    };
}

export class AudioController {
    // ACTIVE element -- drives the reducer, emits external events.
    private audio: HTMLAudioElement;
    // IDLE element -- pre-buffers the next track for a true-gapless boundary
    // swap on `ended`. Bare (no context) off-iOS; both elements share the
    // iOS AudioContext/analyser graph when it exists.
    private audioNext: HTMLAudioElement;
    readonly soundLab: SoundLabSession;
    private crossfade: DeckTransition | null = null;
    private pendingGaplessSwap: { incoming: HTMLAudioElement; generation: number; trackId: string } | null = null;
    private crossfadeAttemptGeneration: number | null = null;
    private unsubscribeSoundLab: (() => void) | null = null;
    private crossfadeVisibility: (() => void) | null = null;
    private audioSessionSet = false;

    // State machine
    private snapshot: EngineSnapshot;
    private subscribers: Set<(snap: EngineSnapshot) => void> = new Set();

    // External event listeners (ended / timeupdate / canplay / seeked / error / gapless-advance)
    private externalListeners: Map<ExternalEvent, Set<ExternalCallback>> = new Map();

    // Native element listeners for cleanup -- one store per owned element.
    private nativeListeners: ListenerStore = [];
    private nativeListenersNext: ListenerStore = [];

    // Gapless preload bookkeeping. `expectedNext*` is set by the
    // React layer once it knows what's next; `preloadedTrackId`/`idleReady`
    // track what the idle element has actually buffered.
    private expectedNextTrackId: string | null = null;
    private expectedNextUrl: string | null = null;
    private expectedNextDurationS: number | null = null;
    private preloadedTrackId: string | null = null;
    private idleReady = false;

    private timers: Map<TimerId, ReturnType<typeof setTimeout>> = new Map();

    // 1s ticker
    private tickerInterval: ReturnType<typeof setInterval> | null = null;

    // Tracks whether the last pause event was caused by our own call-pause effect
    private expectingPause = false;

    // Volume / mute
    private volume = 1;
    private isMuted = false;
    private playbackRate = 1;

    // iOS standalone PWAs lose the <audio> session in the background while
    // MediaSession still reports "playing" (WebKit #261858). Routing the element
    // through an AudioContext holds the session; built on the first gesture play.
    private audioContext: AudioContext | null = null;
    private mediaSourceNode: MediaElementAudioSourceNode | null = null;
    private mediaSourceNodeNext: MediaElementAudioSourceNode | null = null;
    private audioContextBridgeAttempted = false;
    private audioContextStateHandler: (() => void) | null = null;

    // Detects iOS reporting "running" and "playing" while emitting no sound,
    // which happens after cold start or returning to the foreground. Armed only
    // for a window after those; null off iOS, where the bridge is never built.
    private analyser: AnalyserNode | null = null;
    private armDetectorUntil = 0;
    private silentStreak = 0;
    private lastAnalyserCurrentTime: number | null = null;

    // Bounds how many times a single silent episode may trigger a full
    // DOM/Web-Audio rebuild. Reset ONLY when audible output is confirmed
    // (see checkSilentPlayback), so a genuinely wedged context gets one
    // rebuild attempt per episode rather than thrashing every 5 ticks.
    private rebuildCount = 0;

    // Silent-buffer unlock latch (see unlockOnce) and the persistent global
    // gesture listener that keeps the AudioContext resumed across iOS
    // backgrounding/interruption without needing a prime() call at every
    // playback call site.
    private unlockedOnce = false;
    private gestureUnlockHandler: (() => void) | null = null;

    constructor() {
        this.audio = typeof document === "undefined" ? ({} as HTMLAudioElement) : this.createOwnedElement("main");
        this.audioNext = typeof document === "undefined" ? ({} as HTMLAudioElement) : this.createOwnedElement("next");

        // No AudioContext is allocated by the optional desktop Sound Lab
        // until the listener explicitly enables it.
        this.soundLab = new SoundLabSession([this.audio, this.audioNext], () => {
            if (this.snapshot.intent === "play") this.pause("system");
        });

        const events: ExternalEvent[] = ["ended", "timeupdate", "canplay", "seeked", "error", "gapless-advance"];
        events.forEach((e) => this.externalListeners.set(e, new Set()));

        this.snapshot = initialSnapshot();

        this.attachNativeListeners(this.audio, this.nativeListeners);
        this.attachIdleListeners(this.audioNext, this.nativeListenersNext);
        this.initializeVolume();
        this.attachGestureUnlock();
        this.unsubscribeSoundLab = this.soundLab.subscribe(() => {
            if (this.crossfade && (!this.soundLab.hasRunningGraph() ||
                this.soundLab.getSnapshot().crossfadeSeconds !== this.crossfade.requested)) {
                this.cancelCrossfade();
            }
        });
        if (typeof document !== "undefined") {
            this.crossfadeVisibility = () => {
                if (document.visibilityState === "hidden") this.cancelCrossfade();
            };
            document.addEventListener("visibilitychange", this.crossfadeVisibility);
        }
    }

    // The controller owns its <audio> elements so rebuildAudioContextBridge()
    // can recreate the whole graph without a React remount when iOS wedges the
    // session, and so the idle element can buffer the next track for gapless play.
    private createOwnedElement(role: "main" | "next"): HTMLAudioElement {
        const el = document.createElement("audio");
        el.setAttribute("playsinline", "");
        el.preload = "auto";
        el.playbackRate = this.playbackRate;
        el.crossOrigin = "anonymous";
        el.style.display = "none";
        el.setAttribute("data-kima-player", role);
        document.body.appendChild(el);
        return el;
    }

    // Claims the iOS "playback" session category. An interruption can hand the
    // category to another app, so an explicit resume passes force to re-claim it;
    // without that the resume is silent. The latch only skips the automatic paths.
    private setAudioSessionPlayback(force = false): void {
        if (this.audioSessionSet && !force) return;
        this.audioSessionSet = true;
        try {
            const nav = navigator as { audioSession?: { type: string } };
            if (nav.audioSession) {
                nav.audioSession.type = "playback";
            }
        } catch {
            // Not supported
        }
    }

    private isIosStandalone(): boolean {
        if (typeof window === "undefined") return false;
        try {
            const isIos =
                /iPhone|iPad|iPod/.test(navigator.userAgent) ||
                (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
            if (!isIos) return false;
            const legacy = (navigator as { standalone?: boolean }).standalone === true;
            const modern = window.matchMedia?.("(display-mode: standalone)").matches === true;
            return legacy || modern;
        } catch {
            return false;
        }
    }

    // A permanent capture-phase gesture listener: iOS re-suspends the context in
    // the background, so every gesture must be able to resume it. prime() is a
    // no-op once the context runs, and everywhere off iOS.
    private attachGestureUnlock(): void {
        if (typeof document === "undefined") return;
        this.gestureUnlockHandler = () => this.prime();
        document.addEventListener("pointerdown", this.gestureUnlockHandler, { passive: true, capture: true });
        document.addEventListener("touchend", this.gestureUnlockHandler, { passive: true, capture: true });
    }

    // Synchronous, repeatable gesture-time unlock: no await and no play(), only
    // re-claims the session and resumes the AudioContext. Runs only in an iOS
    // standalone PWA; a no-op everywhere else, including iOS Safari tabs.
    prime(): void {
        this.soundLab.resume();
        if (!this.isIosStandalone()) return;
        this.setAudioSessionPlayback(true);
        this.setupAudioContextBridge();
        this.ensureContextRunning();
        this.unlockOnce();
    }

    // resume() resolving does not guarantee CoreAudio actually started clocking --
    // starting a 1-frame silent buffer source forces it. Latched so it only runs once.
    private unlockOnce(): void {
        if (this.unlockedOnce) return;
        if (!this.isIosStandalone() || !this.audioContext) return;
        try {
            const ctx = this.audioContext;
            const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
            source.onended = () => {
                try {
                    source.disconnect();
                } catch {
                    // Already disconnected
                }
            };
            // Latch ONLY on success -- a failed attempt stays retryable on a later gesture.
            this.unlockedOnce = true;
        } catch {
            // Not fatal -- leave the latch unset so a later gesture retries.
        }
    }

    private setupAudioContextBridge(): void {
        if (this.audioContextBridgeAttempted) {
            // Already attempted; resume (with the retry ladder) if suspended.
            this.ensureContextRunning();
            return;
        }
        if (!this.isIosStandalone()) return;
        try {
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return;
            this.audioContext = new AC();
            this.audioContextStateHandler = () => {
                const state = this.audioContext?.state;
                // Interruption over: re-claim the session category but never call
                // play(). iOS gives no signal to tell an earbud unplug from an
                // interruption end, so resuming here would play through the speaker.
                if (state === "running" && !this.audio.paused) {
                    this.setAudioSessionPlayback(true);
                }
            };
            this.audioContext.addEventListener("statechange", this.audioContextStateHandler);
            // Both owned elements route into the SAME context/analyser -- the
            // idle element is paused (silent) so it never pollutes the
            // running-but-silent detector; the two inputs simply sum.
            this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audio);
            this.mediaSourceNodeNext = this.audioContext.createMediaElementSource(this.audioNext);
            try {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.mediaSourceNode.connect(this.analyser);
                this.mediaSourceNodeNext.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
            } catch {
                // Analyser is an enhancement; if it fails, still route audio to the
                // destination so playback works (the silence detector just won't run).
                this.analyser = null;
                this.mediaSourceNode.connect(this.audioContext.destination);
                this.mediaSourceNodeNext.connect(this.audioContext.destination);
            }
            // Latch only after the audio path is fully routed -- a throw in
            // createMediaElementSource or the routing above leaves this false so
            // a later gesture can retry building the bridge instead of the
            // early-return path above permanently latching it half-wired.
            this.audioContextBridgeAttempted = true;
            this.ensureContextRunning();
        } catch {
            // The bridge is optional: without it audio plays through the element alone.
        }
    }

    // Non-blocking resume confirmation: resume() resolving does not guarantee
    // the context actually reached "running" on iOS. Retries up to 3 times
    // with backoff, never awaited, so no caller's play() loses its user gesture.
    private ensureContextRunning(attempt = 0): void {
        const ctx = this.audioContext;
        if (!ctx || ctx.state === "running" || attempt >= 3) return;
        ctx.resume().catch(() => {});
        setTimeout(() => this.ensureContextRunning(attempt + 1), 150 * (attempt + 1));
    }

    // -------------------------------------------------------------------------
    // State machine dispatch
    // -------------------------------------------------------------------------

    private dispatch(event: EngineEvent): void {
        const { snapshot, effects } = transition(this.snapshot, event);
        const changed = snapshot !== this.snapshot;
        this.snapshot = snapshot;

        this.runEffects(effects);

        if (changed) {
            this.updateTicker(snapshot.status);
            this.notifySubscribers();
        }
    }

    private runEffects(effects: Effect[]): void {
        for (const effect of effects) {
            switch (effect.kind) {
                case "set-src-and-load": {
                    this.cancelCrossfade();
                    this.cancelPendingGaplessSwap();
                    // Re-arm the silence detector here too (not just in the
                    // public load()) -- the recovery ladder's own reloads
                    // (e.g. the hidden/blocked->retry path) dispatch this
                    // effect directly without going through load().
                    this.armDetectorUntil = Date.now() + 15000;
                    this.lastAnalyserCurrentTime = this.audio.currentTime;
                    this.audio.src = effect.src;
                    this.audio.load();
                    break;
                }
                case "seek": {
                    this.cancelCrossfade();
                    this.cancelPendingGaplessSwap();
                    try {
                        this.audio.currentTime = effect.time;
                    } catch {
                        // Element not ready
                    }
                    break;
                }
                case "call-play": {
                    // Capture generation at call time so the reaction is bound to it.
                    // The whole dispatch including audio.play() runs synchronously to
                    // preserve the iOS autoplay grant in event tails (e.g. ended -> next track).
                    const capturedGen = this.snapshot.generation;
                    // Resume AudioContext in parallel (fire-and-forget) so it is running
                    // by the time the first audio frames need routing. Must NOT be awaited
                    // or chained -- play() must remain synchronous for the iOS event-tail grant.
                    this.soundLab.resume();
                    this.ensureContextRunning();
                    this.audio.play().then(() => {
                        // Play succeeded -- nothing to do; native-playing fires
                    }).catch((err: unknown) => {
                        if (!(err instanceof DOMException)) {
                            this.dispatch({
                                type: "play-rejected",
                                reason: "other",
                                generation: capturedGen,
                                now: Date.now(),
                            });
                            return;
                        }
                        const name = (err as DOMException).name;
                        if (name === "AbortError") {
                            // Superseded generations are silently ignored by the policy.
                            this.dispatch({
                                type: "play-rejected",
                                reason: "abort",
                                generation: capturedGen,
                                now: Date.now(),
                            });
                        } else if (name === "NotAllowedError") {
                            // Retry once after a short delay -- in headless Playwright
                            // the element may still be loading when play() is first
                            // called; a brief retry lets the browser settle.
                            setTimeout(() => {
                                if (this.snapshot.generation !== capturedGen) return;
                                this.audio.play().catch((retryErr: unknown) => {
                                    if (!(retryErr instanceof DOMException)) {
                                        this.dispatch({
                                            type: "play-rejected",
                                            reason: "other",
                                            generation: capturedGen,
                                            now: Date.now(),
                                        });
                                        return;
                                    }
                                    const rName = (retryErr as DOMException).name;
                                    if (rName === "AbortError") {
                                        this.dispatch({
                                            type: "play-rejected",
                                            reason: "abort",
                                            generation: capturedGen,
                                            now: Date.now(),
                                        });
                                    } else {
                                        this.dispatch({
                                            type: "play-rejected",
                                            reason: "not-allowed",
                                            generation: capturedGen,
                                            now: Date.now(),
                                        });
                                    }
                                });
                            }, 100);
                        } else {
                            this.dispatch({
                                type: "play-rejected",
                                reason: "other",
                                generation: capturedGen,
                                now: Date.now(),
                            });
                        }
                    });
                    break;
                }
                case "call-pause": {
                    this.cancelCrossfade();
                    this.cancelPendingGaplessSwap();
                    this.expectingPause = true;
                    this.audio.pause();
                    break;
                }
                case "arm-timer": {
                    const timerId = effect.timer;
                    const existing = this.timers.get(timerId);
                    if (existing != null) clearTimeout(existing);
                    const handle = setTimeout(() => {
                        this.timers.delete(timerId);
                        this.dispatch({ type: "timer-fired", timer: timerId, now: Date.now() });
                    }, effect.ms);
                    this.timers.set(timerId, handle);
                    break;
                }
                case "cancel-timer": {
                    const timerId = effect.timer;
                    const existing = this.timers.get(timerId);
                    if (existing != null) {
                        clearTimeout(existing);
                        this.timers.delete(timerId);
                    }
                    break;
                }
                case "claim-session": {
                    this.setAudioSessionPlayback(true);
                    this.setupAudioContextBridge();
                    break;
                }
                case "emit-ended": {
                    this.emitExternal("ended");
                    break;
                }
                case "emit-error": {
                    this.emitExternal("error", {
                        error: this.snapshot.error?.message ?? "Audio playback error",
                        code: this.snapshot.error?.code,
                    });
                    break;
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Ticker
    // -------------------------------------------------------------------------

    private updateTicker(status: EngineStatus): void {
        const active = status === "playing" || status === "buffering" || status === "recovering";
        if (active && !this.tickerInterval) {
            this.tickerInterval = setInterval(() => {
                this.dispatch({
                    type: "tick",
                    currentTime: this.audio.currentTime,
                    readyState: this.audio.readyState,
                    paused: this.audio.paused,
                    hidden: document.visibilityState === "hidden",
                    now: Date.now(),
                });
                this.checkSilentPlayback();
            }, TICKER_INTERVAL_MS);
        } else if (!active && this.tickerInterval) {
            clearInterval(this.tickerInterval);
            this.tickerInterval = null;
        }
    }

    // Reads the analyser only inside the armed window while the clock advances.
    // Needs 5 consecutive ticks of exact digital silence, which quiet passages
    // never produce, before reporting.
    private checkSilentPlayback(): void {
        if (!this.analyser) return;

        if (this.snapshot.status !== "playing" || Date.now() >= this.armDetectorUntil) {
            this.silentStreak = 0;
            this.lastAnalyserCurrentTime = null;
            return;
        }

        const currentTime = this.audio.currentTime;
        const advanced =
            this.lastAnalyserCurrentTime !== null && currentTime !== this.lastAnalyserCurrentTime;
        this.lastAnalyserCurrentTime = currentTime;
        if (!advanced) {
            this.silentStreak = 0;
            return;
        }

        const buf = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(buf);
        let sumSq = 0;
        let maxDeviation = 0;
        for (let i = 0; i < buf.length; i++) {
            const deviation = buf[i] - 128;
            sumSq += deviation * deviation;
            const abs = Math.abs(deviation);
            if (abs > maxDeviation) maxDeviation = abs;
        }
        const rms = Math.sqrt(sumSq / buf.length);

        if (rms < 1.0 && maxDeviation < 2) {
            this.silentStreak++;
            if (this.silentStreak >= 5) {
                this.ensureContextRunning();
                if (this.rebuildCount < 1) {
                    this.rebuildAudioContextBridge();
                    this.rebuildCount++;
                }
                this.dispatch({ type: "silent-playback-detected", now: Date.now() });
                this.silentStreak = 0;
            }
        } else {
            // Real output confirmed -- the only place rebuildCount resets, so a
            // rebuild is attempted at most once per genuine silence episode.
            this.silentStreak = 0;
            this.rebuildCount = 0;
        }
    }

    // Recovers a wedged iOS audio session by rebuilding the <audio> element and
    // AudioContext graph. Engine state is untouched and nothing plays: status
    // moves to "blocked", and the retry tap reloads and seeks on the new element.
    private rebuildAudioContextBridge(): void {
        if (!this.isIosStandalone()) return;

        // Detach listeners FIRST -- otherwise pause/emptied events fired by
        // tearing down the old elements dispatch into the live engine mid-rebuild.
        this.detachNativeListeners(this.audio, this.nativeListeners);
        this.detachNativeListeners(this.audioNext, this.nativeListenersNext);
        this.discardElement(this.audio);
        this.discardElement(this.audioNext);

        if (this.audioContextStateHandler) {
            this.audioContext?.removeEventListener("statechange", this.audioContextStateHandler);
        }
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.mediaSourceNode = null;
        this.mediaSourceNodeNext = null;
        this.analyser = null;
        this.audioContextStateHandler = null;

        this.audioContextBridgeAttempted = false;
        this.unlockedOnce = false;
        this.silentStreak = 0;

        this.audio = this.createOwnedElement("main");
        this.audioNext = this.createOwnedElement("next");
        this.attachNativeListeners(this.audio, this.nativeListeners);
        this.attachIdleListeners(this.audioNext, this.nativeListenersNext);
        this.audio.volume = this.isMuted ? 0 : this.volume;
        this.audio.muted = this.isMuted;
        this.audioNext.volume = this.isMuted ? 0 : this.volume;
        this.audioNext.muted = this.isMuted;
        this.audio.playbackRate = this.playbackRate;
        this.audioNext.playbackRate = this.playbackRate;

        // The fresh idle element has no buffer -- drop the stale preload
        // bookkeeping and re-issue the preload from the cached expected-next
        // info (if any) rather than waiting for the next 30s prewarm tick.
        this.preloadedTrackId = null;
        this.idleReady = false;

        // Fresh context + analyser on the new elements. Deliberately does NOT
        // set src / seek / play on the active element here.
        this.setupAudioContextBridge();

        if (this.expectedNextUrl && this.expectedNextTrackId) {
            this.preloadNext();
        }
    }

    // -------------------------------------------------------------------------
    // Native element listeners
    // -------------------------------------------------------------------------

    // ACTIVE element gets the full listener set -- it drives the reducer and
    // emits every external event. `el`/`store` are captured by closure so
    // these handlers stay bound to the element they were attached to even
    // after a later gapless swap repoints `this.audio` elsewhere.
    private attachNativeListeners(
        el: HTMLAudioElement,
        store: ListenerStore,
    ): void {
        const add = listenerAdder(el, store);

        add("playing", () => {
            if (!this.soundLab.canOutput()) {
                this.pause("system");
                return;
            }
            this.dispatch({ type: "native-playing", now: Date.now() });
        });

        add("pause", () => {
            // A natural end may emit pause just before ended. Leave the
            // already-playing incoming deck eligible for that boundary only.
            if (!el.ended) {
                this.cancelCrossfade();
                this.cancelPendingGaplessSwap();
            }
            if (this.expectingPause) {
                // Our own call-pause effect fired this -- do not dispatch native-pause
                this.expectingPause = false;
                return;
            }
            // Unexpected pause (earbud, interruption, system) -- dispatch to policy
            this.dispatch({ type: "native-pause", now: Date.now() });
        });

        add("ended", () => {
            this.handleActiveEnded(el);
        });

        add("timeupdate", () => {
            // Suppress upstream timeupdate while transitioning (avoids 0-position flash)
            if (!this.isTransitioning) {
                this.emitExternal("timeupdate", { time: el.currentTime });
                this.considerCrossfade();
            }
        });

        add("canplay", () => {
            const dur = el.duration;
            // Dispatch first so policy applies the pending seek (if any)
            this.dispatch({ type: "native-canplay", duration: isFinite(dur) ? dur : 0, now: Date.now() });
            // Then emit upstream -- pendingSeek is now applied
            this.emitExternal("canplay", { duration: isFinite(dur) ? dur : 0 });
        });

        add("waiting", () => {
            this.cancelCrossfade();
            this.dispatch({ type: "native-waiting", now: Date.now() });
        });

        add("seeking", () => {
            this.cancelCrossfade();
            this.cancelPendingGaplessSwap();
        });

        add("seeked", () => {
            this.emitExternal("seeked", { time: el.currentTime });
        });

        add("error", () => {
            this.cancelCrossfade();
            const err = el.error;
            this.dispatch({
                type: "native-error",
                code: err?.code ?? 0,
                message: err?.message ?? "Audio error",
                now: Date.now(),
            });
        });

        // "stalled" is not forwarded to the policy: on iOS it fires during
        // healthy playback (readyState 4), so it carries no signal.
    }

    // IDLE element gets a minimal listener set -- it never drives the
    // reducer. `canplay` marks the preload as ready to swap into; `error`
    // clears the preload so a stale/broken buffer can never be swapped in.
    private attachIdleListeners(
        el: HTMLAudioElement,
        store: ListenerStore,
    ): void {
        const add = listenerAdder(el, store);

        add("canplay", () => {
            this.idleReady = true;
        });

        add("waiting", () => this.cancelCrossfade());
        add("ended", () => this.cancelCrossfade());
        add("error", () => {
            this.cancelCrossfade();
            // Let the guarded pending play rejection finish a normal swap.
            this.preloadedTrackId = null;
            this.idleReady = false;
        });
    }

    private discardElement(el: HTMLAudioElement): void {
        el.pause();
        el.removeAttribute("src");
        el.load();
        try {
            el.remove();
        } catch {
            // Element already detached
        }
    }

    private detachNativeListeners(
        el: HTMLAudioElement,
        store: ListenerStore,
    ): void {
        for (const { event, handler } of store) {
            el.removeEventListener(event, handler);
        }
        store.length = 0;
    }

    // -------------------------------------------------------------------------
    // Gapless swap -- fires from the ACTIVE element's native `ended`.
    // -------------------------------------------------------------------------

    // Decides gapless eligibility here rather than in the reducer: the swap's
    // play() must run synchronously in this handler to keep the iOS
    // user-activation grant.
    /** Only overlap on the opted-in desktop graph, with a known, ready next
     * music track. Keep the outgoing track authoritative until its natural end.
     * No tempo shifting or beat-grid claims: this is a bounded linear fade.
     */
    private considerCrossfade(): void {
        if (this.crossfade || this.crossfadeAttemptGeneration === this.snapshot.generation ||
            !this.soundLab.hasRunningGraph() || document.visibilityState !== "visible" ||
            this.snapshot.status !== "playing" || this.audio.paused || this.audio.ended ||
            this.audio.seeking || this.playbackRate !== 1 ||
            !this.expectedNextTrackId || this.preloadedTrackId !== this.expectedNextTrackId ||
            !this.idleReady || !this.audioNext.paused || this.audioNext.readyState < 3) return;
        const requested = this.soundLab.getSnapshot().crossfadeSeconds;
        const duration = this.audio.duration;
        const incomingDuration = this.audioNext.duration;
        const window = transitionSeconds(requested, duration, incomingDuration);
        const remaining = duration - this.audio.currentTime;
        if (window < 1 || !Number.isFinite(remaining) || remaining > window || remaining < 1) return;
        // Ignore implausible/truncated durations and stale or previously played
        // buffers. An uncertain boundary must use the ordinary playback path.
        if (!this.snapshot.expectedDurationS || !this.expectedNextDurationS ||
            Math.abs(duration - this.snapshot.expectedDurationS) > 3 ||
            Math.abs(incomingDuration - this.expectedNextDurationS) > 3 ||
            this.audioNext.currentTime > 0.15 || this.audioNext.seeking) return;
        const fade: DeckTransition = {
            outgoing: this.audio, incoming: this.audioNext, generation: this.snapshot.generation,
            trackId: this.expectedNextTrackId, requested,
            outgoingStart: this.audio.currentTime, incomingStart: this.audioNext.currentTime,
            seconds: remaining, startedAt: Date.now(), ready: false, progress: 0, timer: null,
        };
        this.crossfadeAttemptGeneration = this.snapshot.generation;
        this.crossfade = fade;
        this.applyDeckVolumes();
        try {
            const play = fade.incoming.play();
            Promise.resolve(play).then(() => {
                // pause/load on cancellation invalidates this play operation;
                // a late completion must never touch a reused deck.
                if (this.crossfade !== fade) return;
                fade.ready = true;
                this.advanceCrossfade();
            }).catch(() => {
                if (this.crossfade === fade) this.cancelCrossfade();
            });
            fade.timer = setInterval(() => this.advanceCrossfade(), FADE_TICK_MS);
        } catch {
            this.cancelCrossfade();
        }
    }

    private validCrossfade(fade: DeckTransition): boolean {
        return fade.generation === this.snapshot.generation &&
            fade.outgoing === this.audio && fade.incoming === this.audioNext &&
            fade.trackId === this.expectedNextTrackId && fade.trackId === this.preloadedTrackId &&
            this.soundLab.hasRunningGraph() && this.soundLab.getSnapshot().crossfadeSeconds === fade.requested &&
            document.visibilityState === "visible" && this.playbackRate === 1;
    }

    private advanceCrossfade(): void {
        const fade = this.crossfade;
        if (!fade) return;
        const elapsed = Date.now() - fade.startedAt;
        if (!this.validCrossfade(fade) || elapsed > (fade.seconds + 2) * 1000) {
            this.cancelCrossfade();
            return;
        }
        // Natural end is handled by the native ended event. Do not treat it
        // as a manual interruption while that event is queued.
        if (fade.outgoing.ended) return;
        if (fade.outgoing.paused || fade.outgoing.seeking || this.snapshot.status !== "playing") {
            this.cancelCrossfade();
            return;
        }
        const played = fade.incoming.currentTime - fade.incomingStart;
        if (!fade.ready || played < 0.025) {
            if (elapsed > 1500) this.cancelCrossfade();
            return;
        }
        if (fade.incoming.paused || fade.incoming.ended || fade.incoming.seeking || fade.incoming.readyState < 2) {
            this.cancelCrossfade();
            return;
        }
        // Never fade the outgoing deck out faster than the incoming media
        // actually advances. A slow buffer therefore cannot create dead air.
        const progress = Math.min(1,
            (fade.outgoing.currentTime - fade.outgoingStart) / fade.seconds,
            played / fade.seconds);
        if (!Number.isFinite(progress) || progress < 0 || progress + 0.02 < fade.progress) {
            this.cancelCrossfade();
            return;
        }
        fade.progress = Math.max(fade.progress, progress);
        this.applyDeckVolumes();
    }

    private applyDeckVolumes(): void {
        const fade = this.crossfade;
        if (fade) {
            const gains = crossfadeGains(fade.progress, this.volume, this.isMuted);
            fade.outgoing.volume = gains.outgoing;
            fade.incoming.volume = gains.incoming;
        } else {
            const volume = this.isMuted ? 0 : this.volume;
            this.audio.volume = volume;
            this.audioNext.volume = volume;
        }
    }

    private cancelCrossfade(): void {
        const fade = this.crossfade;
        if (!fade) return;
        this.crossfade = null;
        if (fade.timer !== null) clearInterval(fade.timer);
        // Stop and invalidate the pending media operation before restoring
        // gain. Never carry an already-started idle buffer into a new queue.
        fade.incoming.pause();
        fade.incoming.removeAttribute("src");
        fade.incoming.load();
        this.preloadedTrackId = null;
        this.idleReady = false;
        this.applyDeckVolumes();
    }

    private completeCrossfade(): boolean {
        const fade = this.crossfade;
        if (!fade) return false;
        const incomingTime = fade.incoming.currentTime;
        if (!this.validCrossfade(fade) || !fade.ready || fade.incoming.paused ||
            fade.incoming.ended || fade.incoming.seeking || fade.incoming.readyState < 2 ||
            !Number.isFinite(incomingTime) || incomingTime - fade.incomingStart < 0.1 ||
            !fade.outgoing.ended || fade.outgoing.currentTime < fade.outgoing.duration - 0.25) {
            this.cancelCrossfade();
            return false;
        }
        this.crossfade = null;
        if (fade.timer !== null) clearInterval(fade.timer);
        // No second play() call, no seek back to zero. Carry the actual
        // already-audible incoming position into queue/player bookkeeping.
        fade.incoming.volume = this.isMuted ? 0 : this.volume;
        this.onSwapCommitted(fade.generation, incomingTime);
        return true;
    }

    private cancelPendingGaplessSwap(): void {
        const swap = this.pendingGaplessSwap;
        if (!swap) return;
        this.pendingGaplessSwap = null;
        swap.incoming.pause();
        swap.incoming.removeAttribute("src");
        swap.incoming.load();
        this.preloadedTrackId = null;
        this.idleReady = false;
    }

    private handleActiveEnded(el: HTMLAudioElement): void {
        if (this.pendingGaplessSwap || this.snapshot.pauseClass === "user") return;
        if (!this.soundLab.canOutput()) {
            this.pause("system");
            return;
        }
        if (this.completeCrossfade()) return;
        const eligible =
            !!this.expectedNextTrackId &&
            this.preloadedTrackId === this.expectedNextTrackId &&
            this.idleReady;

        if (!eligible) {
            this.dispatch({
                type: "native-ended",
                currentTime: el.currentTime,
                duration: el.duration,
                now: Date.now(),
            });
            return;
        }

        // Invoke play synchronously in the ended handler. Guard both
        // success and rejection against intervening pause/load/queue edits.
        const swap = {
            incoming: this.audioNext, generation: this.snapshot.generation,
            trackId: this.expectedNextTrackId!,
        };
        this.pendingGaplessSwap = swap;
        const finish = (success: boolean) => {
            if (this.pendingGaplessSwap !== swap) return;
            if (this.snapshot.generation !== swap.generation ||
                this.audioNext !== swap.incoming ||
                this.expectedNextTrackId !== swap.trackId) {
                this.cancelPendingGaplessSwap();
                return;
            }
            if (success && this.preloadedTrackId === swap.trackId && this.idleReady) {
                this.pendingGaplessSwap = null;
                this.onSwapCommitted(swap.generation);
            } else {
                this.cancelPendingGaplessSwap();
                this.onSwapFailed();
            }
        };
        try {
            const play = swap.incoming.play();
            if (play && typeof play.then === "function") {
                void play.then(() => finish(true), () => finish(false));
            } else {
                finish(true);
            }
        } catch {
            finish(false);
        }
    }

    private onSwapCommitted(swapGen: number, incomingTime = 0): void {
        if (this.snapshot.generation !== swapGen) {
            // A skip or load() landed while play() resolved and already loaded
            // its own track. Abandon the swap without touching pointers or state.
            this.audioNext.pause();
            return;
        }

        if (!this.soundLab.canOutput()) {
            this.audioNext.pause();
            this.pause("system");
            return;
        }

        const swappedTrackId = this.expectedNextTrackId;
        const newSrc = this.audioNext.src;
        const newDur = this.audioNext.duration;
        const expectedDurationS = this.expectedNextDurationS;

        // Detach from BOTH elements before the pointer flip -- otherwise a
        // pause/emptied event fired by the reused-as-idle element below could
        // dispatch into the live engine using the wrong listener set.
        this.detachNativeListeners(this.audio, this.nativeListeners);
        this.detachNativeListeners(this.audioNext, this.nativeListenersNext);

        const oldActive = this.audio;
        this.audio = this.audioNext;
        this.audioNext = oldActive;
        this.audio.setAttribute("data-kima-player", "main");
        this.audioNext.setAttribute("data-kima-player", "next");

        const oldNode = this.mediaSourceNode;
        this.mediaSourceNode = this.mediaSourceNodeNext;
        this.mediaSourceNodeNext = oldNode;

        this.attachNativeListeners(this.audio, this.nativeListeners);
        this.attachIdleListeners(this.audioNext, this.nativeListenersNext);

        // Reuse the old active element as the new idle.
        this.audioNext.pause();
        this.audioNext.removeAttribute("src");
        this.audioNext.load();
        // Sync volume/mute onto the reused idle element so the NEXT
        // swap carries no jump even if setVolume/setMuted fired in between.
        this.audioNext.volume = this.isMuted ? 0 : this.volume;
        this.audioNext.muted = this.isMuted;
        this.audioNext.playbackRate = this.playbackRate;

        this.preloadedTrackId = null;
        this.idleReady = false;
        this.expectedNextTrackId = null;
        this.expectedNextUrl = null;
        this.expectedNextDurationS = null;

        this.dispatch({
            type: "gapless-swapped",
            src: newSrc,
            durationS: isFinite(newDur) ? newDur : undefined,
            expectedDurationS: expectedDurationS ?? undefined,
            ...(incomingTime > 0 ? { currentTimeS: incomingTime } : {}),
            now: Date.now(),
        });

        this.emitExternal("gapless-advance", {
            durationS: isFinite(newDur) ? newDur : (expectedDurationS ?? 0),
            trackId: swappedTrackId,
            ...(incomingTime > 0 ? { currentTimeS: incomingTime } : {}),
        });

        // Re-arm the silence detector for the freshly-active element -- the
        // swap bypasses load(), which is where this normally happens.
        this.armDetectorUntil = Date.now() + 15000;
        this.lastAnalyserCurrentTime = null;
        this.silentStreak = 0;
        this.rebuildCount = 0;
    }

    private onSwapFailed(): void {
        // Nothing was mutated (see handleActiveEnded) -- fall through exactly
        // like the not-eligible path so the cold-load recovery takes over.
        this.dispatch({
            type: "native-ended",
            currentTime: this.audio.currentTime,
            duration: this.audio.duration,
            now: Date.now(),
        });
    }

    // -------------------------------------------------------------------------
    // Subscriber management
    // -------------------------------------------------------------------------

    private notifySubscribers(): void {
        this.subscribers.forEach((fn) => {
            try {
                fn(this.snapshot);
            } catch (err) {
                console.error("[AudioController] Subscriber error:", err);
            }
        });
    }

    subscribe(fn: (snap: EngineSnapshot) => void): () => void {
        this.subscribers.add(fn);
        // Call immediately with current snapshot
        try {
            fn(this.snapshot);
        } catch (err) {
            console.error("[AudioController] Subscriber error on initial call:", err);
        }
        return () => {
            this.subscribers.delete(fn);
        };
    }

    getSnapshot(): EngineSnapshot {
        return this.snapshot;
    }

    // -------------------------------------------------------------------------
    // External event bus
    // -------------------------------------------------------------------------

    on(event: ExternalEvent, cb: ExternalCallback): void {
        this.externalListeners.get(event)?.add(cb);
    }

    off(event: ExternalEvent, cb: ExternalCallback): void {
        this.externalListeners.get(event)?.delete(cb);
    }

    private emitExternal(event: ExternalEvent, data?: unknown): void {
        this.externalListeners.get(event)?.forEach((cb) => {
            try {
                cb(data);
            } catch (err) {
                console.error(`[AudioController] Event listener error (${event}):`, err);
            }
        });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    load(src: string, opts: { autoplay?: boolean; seekTo?: number; expectedDurationS?: number } = {}): void {
        const { autoplay = false, seekTo, expectedDurationS } = opts;
        this.armDetectorUntil = Date.now() + 15000;
        this.lastAnalyserCurrentTime = this.audio.currentTime;

        // Same-src dedup: if already loading this src, only update intent
        if (src === this.snapshot.src && this.snapshot.status === "loading" && seekTo === undefined) {
            if (autoplay) {
                this.dispatch({ type: "play-requested", now: Date.now() });
            }
            return;
        }

        this.clearExpectedNext();
        this.dispatch({
            type: "load",
            src,
            autoplay,
            seekTo,
            expectedDurationS,
            now: Date.now(),
        });
    }

    play(): void {
        this.dispatch({ type: "play-requested", now: Date.now() });
    }

    pause(cls: "user" | "system" = "user"): void {
        this.cancelCrossfade();
        this.cancelPendingGaplessSwap();
        this.dispatch({ type: "pause-requested", cls, now: Date.now() });
    }

    seek(time: number): void {
        this.cancelCrossfade();
        this.cancelPendingGaplessSwap();
        const duration = this.audio.duration;
        if (duration && isFinite(duration) && duration > 0) {
            time = Math.max(0, Math.min(time, duration));
        } else {
            time = Math.max(0, time);
        }
        try {
            this.audio.currentTime = time;
        } catch {
            console.warn("[AudioController] Seek failed: element not ready");
        }
    }

    cleanup(): void {
        this.clearExpectedNext();
        this.crossfadeAttemptGeneration = null;
        this.dispatch({ type: "cleanup", now: Date.now() });

        for (const [, handle] of this.timers) {
            clearTimeout(handle);
        }
        this.timers.clear();

        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
    }

    destroy(): void {
        this.cleanup();
        this.detachNativeListeners(this.audio, this.nativeListeners);
        this.detachNativeListeners(this.audioNext, this.nativeListenersNext);

        if (this.gestureUnlockHandler) {
            document.removeEventListener("pointerdown", this.gestureUnlockHandler, { capture: true });
            document.removeEventListener("touchend", this.gestureUnlockHandler, { capture: true });
            this.gestureUnlockHandler = null;
        }

        if (this.tickerInterval) {
            clearInterval(this.tickerInterval);
            this.tickerInterval = null;
        }

        if (this.audioContext) {
            if (this.audioContextStateHandler) {
                this.audioContext.removeEventListener("statechange", this.audioContextStateHandler);
                this.audioContextStateHandler = null;
            }
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
            this.mediaSourceNode = null;
            this.mediaSourceNodeNext = null;
        }

        // Owned-element teardown -- the controller appended these itself, so
        // it must remove them here too.
        this.discardElement(this.audio);
        this.discardElement(this.audioNext);
        this.unsubscribeSoundLab?.();
        this.unsubscribeSoundLab = null;
        if (this.crossfadeVisibility) document.removeEventListener("visibilitychange", this.crossfadeVisibility);
        this.crossfadeVisibility = null;
        this.soundLab.destroy();

        this.subscribers.clear();
    }

    notifyForeground(): void {
        this.armDetectorUntil = Date.now() + 15000;
        this.lastAnalyserCurrentTime = this.audio.currentTime;
        this.dispatch({ type: "foreground", now: Date.now() });
    }

    getCurrentTime(): number {
        return this.audio.currentTime || 0;
    }

    getDuration(): number {
        const d = this.audio.duration;
        return d && isFinite(d) ? d : 0;
    }

    isPlaying(): boolean {
        return !this.audio.paused && !this.audio.ended;
    }

    get isTransitioning(): boolean {
        return (
            this.snapshot.status === "loading" ||
            this.snapshot.pendingSeek != null
        );
    }

    getState(): Readonly<{ currentSrc: string | null; volume: number; isMuted: boolean }> {
        return { currentSrc: this.snapshot.src, volume: this.volume, isMuted: this.isMuted };
    }

    // setExpectedNext() records which track React expects next; preloadNext()
    // buffers it into the idle element. Separate so a queue change can update
    // the expectation without restarting a fetch already in flight.
    setExpectedNext(url: string, trackId: string, durationS?: number): void {
        if (this.expectedNextTrackId !== trackId) {
            this.cancelCrossfade();
            this.cancelPendingGaplessSwap();
        }
        this.expectedNextTrackId = trackId;
        this.expectedNextUrl = url;
        this.expectedNextDurationS = durationS ?? null;
    }

    preloadNext(): void {
        if (!this.expectedNextUrl || !this.expectedNextTrackId) return;
        if (this.preloadedTrackId === this.expectedNextTrackId) return;
        this.idleReady = false;
        this.audioNext.src = this.expectedNextUrl;
        this.audioNext.load();
        this.preloadedTrackId = this.expectedNextTrackId;
    }

    // Called when the upcoming-track expectation is no longer valid (queue
    // left "track" playback, or repeat mode switched to "one" -- which has
    // no real next track) so a stale preload can never be swapped in.
    clearExpectedNext(): void {
        this.cancelCrossfade();
        this.cancelPendingGaplessSwap();
        this.idleReady = false;
        this.expectedNextTrackId = null;
        this.expectedNextUrl = null;
        this.expectedNextDurationS = null;
        this.preloadedTrackId = null;
    }

    /**
     * A single rate for both audio elements prevents a jump at a gapless swap
     * or a rebuilt iOS audio session. The React player resets this to 1x
     * whenever the playback type is not an audiobook.
     */
    setPlaybackRate(rate: number): void {
        const next = Number.isFinite(rate) ? Math.max(0.75, Math.min(2, rate)) : 1;
        if (next !== this.playbackRate) this.cancelCrossfade();
        this.playbackRate = next;
        this.audio.playbackRate = this.playbackRate;
        this.audioNext.playbackRate = this.playbackRate;
    }

    getPlaybackRate(): number {
        return this.playbackRate;
    }

    setVolume(volume: number): void {
        this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
        if (this.crossfade || !this.isMuted) this.applyDeckVolumes();
    }

    setMuted(muted: boolean): void {
        this.isMuted = muted;
        // audio.muted, since audio.volume is read-only on iOS.
        this.audio.muted = muted;
        this.audioNext.muted = muted;
        // Do not destroy a fade envelope when the master is changed.
        if (this.crossfade || !muted) this.applyDeckVolumes();
    }

    initializeVolume(): void {
        if (typeof window === "undefined") return;

        try {
            const savedVolume = localStorage.getItem(STORAGE_KEYS.VOLUME);
            const savedMuted = localStorage.getItem(STORAGE_KEYS.IS_MUTED);

            if (savedVolume) {
                const parsed = parseFloat(savedVolume);
                if (!isNaN(parsed)) {
                    this.volume = Math.max(0, Math.min(1, parsed));
                }
            }
            if (savedMuted === "true") {
                this.isMuted = true;
            }

            this.audio.volume = this.isMuted ? 0 : this.volume;
            this.audioNext.volume = this.isMuted ? 0 : this.volume;
        } catch (error) {
            console.error("[AudioController] Failed to initialize from storage:", error);
        }
    }
}

