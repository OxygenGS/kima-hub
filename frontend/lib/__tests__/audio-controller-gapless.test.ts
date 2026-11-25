import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioController } from "../audio-controller";

// Fakes for the dual-element gapless swap, which is not iOS-gated, so a desktop
// UA is used. Browser globals are stubbed per test.

function createFakeAudioElement() {
    const listeners: Record<string, Array<() => void>> = {};
    return {
        preload: "",
        crossOrigin: "",
        src: "",
        currentTime: 0,
        duration: 0,
        paused: true,
        ended: false,
        seeking: false,
        volume: 1,
        muted: false,
        playbackRate: 1,
        readyState: 0,
        error: null as { code?: number; message?: string } | null,
        style: {} as Record<string, string>,
        setAttribute: vi.fn(),
        addEventListener: vi.fn((event: string, handler: () => void) => {
            (listeners[event] ??= []).push(handler);
        }),
        removeEventListener: vi.fn((event: string, handler: () => void) => {
            listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
        }),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        remove: vi.fn(),
        // Test helper, not part of the real element API.
        __fire(event: string) {
            (listeners[event] || []).slice().forEach((h) => h());
        },
    };
}

type FakeAudioElement = ReturnType<typeof createFakeAudioElement>;

function installEnv(): { created: FakeAudioElement[] } {
    const created: FakeAudioElement[] = [];
    const fakeDocument = {
        visibilityState: "visible",
        hasFocus: () => true,
        createElement: (_tag: string) => {
            const el = createFakeAudioElement();
            created.push(el);
            return el;
        },
        body: { appendChild: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    const fakeWindow = {
        matchMedia: () => ({ matches: false }),
    };
    const fakeNavigator = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        maxTouchPoints: 0,
        standalone: false,
    };
    const fakeLocalStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };

    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("navigator", fakeNavigator);
    vi.stubGlobal("localStorage", fakeLocalStorage);

    return { created };
}

// The constructor creates `this.audio` (main) then `this.audioNext` (next),
// in that order -- pull both real created elements back out.
function newController(): {
    controller: AudioController;
    audio: FakeAudioElement;
    audioNext: FakeAudioElement;
} {
    const { created } = installEnv();
    const controller = new AudioController();
    return { controller, audio: created[0], audioNext: created[1] };
}

// Flush the microtask queue enough times for a resolved/rejected play()
// promise's .then()/.catch() to have run.
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

type ControllerInternals = {
    audio: FakeAudioElement;
    audioNext: FakeAudioElement;
    preloadedTrackId: string | null;
    expectedNextTrackId: string | null;
    idleReady: boolean;
    armDetectorUntil: number;
    silentStreak: number;
    rebuildCount: number;
};

function internals(controller: AudioController): ControllerInternals {
    return controller as unknown as ControllerInternals;
}

// Sets up an eligible preload: preloadNext() + a canplay on the idle element.
function makeEligible(
    controller: AudioController,
    audioNext: FakeAudioElement,
    trackId: string,
    url: string,
    durationS: number,
): void {
    controller.setExpectedNext(url, trackId, durationS);
    controller.preloadNext();
    audioNext.duration = durationS;
    audioNext.__fire("canplay");
}

beforeEach(() => {
    vi.useRealTimers();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Eligible swap
// ---------------------------------------------------------------------------

describe("AudioController -- gapless swap: eligible", () => {
    it("on ended: swaps to the idle element synchronously in the play() call, then commits pointers/listeners/detector on resolve, emits gapless-advance, and never dispatches native-ended", async () => {
        const { controller, audio, audioNext } = newController();

        const endedCb = vi.fn();
        const gaplessCb = vi.fn();
        controller.on("ended", endedCb);
        controller.on("gapless-advance", gaplessCb);

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 210);

        // The swap `.play()` call must happen synchronously inside the native
        // `ended` tail -- assert it fired before any microtask flush.
        audio.__fire("ended");
        expect(audioNext.play).toHaveBeenCalledTimes(1);

        await flushMicrotasks();

        const snap = controller.getSnapshot();
        expect(snap.status).toBe("playing");
        expect(snap.src).toBe("http://x.com/b.mp3");
        expect(snap.duration).toBe(210);

        // Pointers swapped: the former idle fake is now the active element,
        // the former active fake is now the idle element.
        const state = internals(controller);
        expect(state.audio).toBe(audioNext);
        expect(state.audioNext).toBe(audio);

        // Old active element reused as idle -- torn down and re-synced.
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.removeAttribute).toHaveBeenCalledWith("src");
        expect(audio.load).toHaveBeenCalled();

        // Preload bookkeeping cleared post-swap.
        expect(state.preloadedTrackId).toBeNull();
        expect(state.expectedNextTrackId).toBeNull();
        expect(state.idleReady).toBe(false);

        // Detector re-armed for the new active element.
        expect(state.armDetectorUntil).toBeGreaterThan(Date.now() - 1000);
        expect(state.silentStreak).toBe(0);
        expect(state.rebuildCount).toBe(0);

        // React layer notified via gapless-advance; native "ended" must NOT fire
        // (that would imply a cold-load fallback, defeating the whole point).
        expect(gaplessCb).toHaveBeenCalledTimes(1);
        expect(gaplessCb).toHaveBeenCalledWith({ durationS: 210, trackId: "track-2" });
        expect(endedCb).not.toHaveBeenCalled();
    });

    it("applies audiobook speed to both elements and resets invalid rates safely", async () => {
        const { controller, audio, audioNext } = newController();
        controller.setPlaybackRate(1.5);
        expect(audio.playbackRate).toBe(1.5);
        expect(audioNext.playbackRate).toBe(1.5);
        expect(controller.getPlaybackRate()).toBe(1.5);

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 100);
        audio.playbackRate = 1;
        audio.__fire("ended");
        await flushMicrotasks();
        // The old active element was recycled as idle, but keeps the speed.
        expect(audio.playbackRate).toBe(1.5);
        expect(audioNext.playbackRate).toBe(1.5);
        controller.setPlaybackRate(Number.NaN);
        expect(controller.getPlaybackRate()).toBe(1);
        expect(audio.playbackRate).toBe(1);
        expect(audioNext.playbackRate).toBe(1);
    });

    it("carries the current volume/mute onto the reused idle element", async () => {
        const { controller, audio, audioNext } = newController();

        controller.setVolume(0.4);
        // Both elements immediately carry the volume.
        expect(audioNext.volume).toBe(0.4);

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 100);

        // Poison the element that will become the reused idle -- setVolume(0.4)
        // above already wrote 0.4 onto it, so without this the test would pass
        // even if the swap-time re-sync lines were deleted.
        audio.volume = 1;
        audio.muted = true;

        audio.__fire("ended");
        await flushMicrotasks();

        // `audio` (the fake) is now the reused idle element -- must carry the
        // controller's tracked volume/mute, not the poisoned values.
        expect(audio.volume).toBe(0.4);
        expect(audio.muted).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Not eligible -> native-ended fallthrough
// ---------------------------------------------------------------------------

describe("AudioController -- gapless swap: not eligible", () => {
    it("falls through to native-ended (honest end -> paused + emit-ended) and never touches the idle element", () => {
        const { controller, audio, audioNext } = newController();
        const endedCb = vi.fn();
        controller.on("ended", endedCb);

        // No preload set up at all.
        audio.currentTime = 100;
        audio.duration = 100;
        audio.__fire("ended");

        expect(audioNext.play).not.toHaveBeenCalled();
        expect(controller.getSnapshot().status).toBe("paused");
        expect(endedCb).toHaveBeenCalledTimes(1);
    });

    it("preloadedTrackId mismatching expectedNextTrackId is not eligible", () => {
        const { controller, audio, audioNext } = newController();

        controller.setExpectedNext("http://x.com/b.mp3", "track-2", 100);
        controller.preloadNext();
        audioNext.duration = 100;
        audioNext.__fire("canplay");

        // Queue mutated after the preload was issued -- now expecting a
        // different track than what was actually buffered.
        controller.setExpectedNext("http://x.com/c.mp3", "track-3", 120);

        audio.currentTime = 100;
        audio.duration = 100;
        audio.__fire("ended");

        expect(audioNext.play).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Swap play() rejection -> native-ended fallthrough (no dead air)
// ---------------------------------------------------------------------------

describe("AudioController -- gapless swap: play() rejection", () => {
    it("falls through to native-ended without any partial mutation", async () => {
        const { controller, audio, audioNext } = newController();
        const endedCb = vi.fn();
        controller.on("ended", endedCb);

        audioNext.play = vi.fn().mockRejectedValue(
            Object.assign(new Error("boom"), { name: "NotAllowedError" }),
        );

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 100);

        audio.currentTime = 50;
        audio.duration = 50;
        audio.__fire("ended");

        await flushMicrotasks();

        // Nothing was mutated before the rejection landed -- pointers unchanged.
        const state = internals(controller);
        expect(state.audio).toBe(audio);
        expect(state.audioNext).toBe(audioNext);

        // Fallback ran the ordinary honest-ended path.
        expect(controller.getSnapshot().status).toBe("paused");
        expect(endedCb).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// repeat-one: no swap
// ---------------------------------------------------------------------------

describe("AudioController -- gapless swap: repeat-one suppression", () => {
    it("clearExpectedNext() (the React layer's repeat-one guard) closes the eligibility gate even with a ready idle buffer", () => {
        const { controller, audio, audioNext } = newController();

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 100);

        // Simulates the audio-controls-context effect that fires when
        // repeatMode -> "one": the preload is no longer a valid next track.
        controller.clearExpectedNext();

        audio.currentTime = 100;
        audio.duration = 100;
        audio.__fire("ended");

        expect(audioNext.play).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Generation guard: a manual skip / ctrl.load() races the swap's play()
// ---------------------------------------------------------------------------

describe("AudioController -- gapless swap: generation guard", () => {
    it("aborts the commit if generation changed between the synchronous play() call and its promise resolving", async () => {
        const { controller, audio, audioNext } = newController();
        const gaplessCb = vi.fn();
        controller.on("gapless-advance", gaplessCb);

        makeEligible(controller, audioNext, "track-2", "http://x.com/b.mp3", 100);

        audio.__fire("ended");
        expect(audioNext.play).toHaveBeenCalledTimes(1);

        // A manual skip / ctrl.load() lands before the swap's play() promise
        // resolves -- this bumps `generation` via the "load" transition and
        // applies its own set-src-and-load to the pre-flip `this.audio`.
        controller.load("http://x.com/manual-skip.mp3");

        await flushMicrotasks();

        // Commit must be aborted: pointers unchanged, no gapless-advance
        // emitted, and the started idle-swap element gets paused so it
        // doesn't play over the intervening track.
        const state = internals(controller);
        expect(state.audio).toBe(audio);
        expect(state.audioNext).toBe(audioNext);
        expect(gaplessCb).not.toHaveBeenCalled();
        expect(audioNext.pause).toHaveBeenCalled();
    });
});

describe("AudioController -- opt-in crossfade", () => {
    let active: AudioController | null = null;

    afterEach(() => {
        active?.destroy();
        active = null;
        vi.useRealTimers();
    });

    function setup(seconds = 6, beatGuided = false) {
        vi.useFakeTimers();
        const state = newController();
        active = state.controller;
        const { controller, audio, audioNext } = state;
        vi.spyOn(controller.soundLab, "hasRunningGraph").mockReturnValue(true);
        const sound = vi.spyOn(controller.soundLab, "getSnapshot").mockReturnValue({
            ...controller.soundLab.getSnapshot(), crossfadeSeconds: seconds, beatGuided,
        });
        controller.load(beatGuided ? "http://x.com/api/library/tracks/track-1/stream" : "http://x.com/a.mp3",
            { autoplay: true, expectedDurationS: 120 });
        audio.duration = 120;
        audio.currentTime = 114;
        audio.paused = false;
        audio.readyState = 4;
        audio.__fire("canplay");
        audio.__fire("playing");
        makeEligible(controller, audioNext, "track-2",
            beatGuided ? "http://x.com/api/library/tracks/track-2/stream" : "http://x.com/b.mp3", 120);
        audioNext.readyState = 4;
        audioNext.play.mockImplementation(async () => { audioNext.paused = false; });
        audioNext.pause.mockImplementation(() => { audioNext.paused = true; });
        return { ...state, sound };
    }

    async function overlap() {
        const state = setup();
        const { audio, audioNext } = state;
        audio.__fire("timeupdate");
        await flushMicrotasks();
        expect(audioNext.play).toHaveBeenCalledOnce();
        expect(audio.volume).toBe(1);
        expect(audioNext.volume).toBe(0);
        audio.currentTime = 117;
        audioNext.currentTime = 3;
        vi.advanceTimersByTime(50);
        expect(audio.volume).toBeCloseTo(0.5);
        expect(audioNext.volume).toBeCloseTo(0.5);
        return state;
    }

    it("starts only on explicit opt-in, not merely because Sound Lab exists", () => {
        const { audio, audioNext } = setup(0);
        audio.__fire("timeupdate");
        expect(audioNext.play).not.toHaveBeenCalled();
        expect(audio.volume).toBe(1);
    });

    it("keeps the gain sum bounded, respects master/mute and promotes the incoming deck at its real position", async () => {
        const { controller, audio, audioNext } = await overlap();
        const onAdvance = vi.fn();
        const ended = vi.fn();
        controller.on("gapless-advance", onAdvance);
        controller.on("ended", ended);
        controller.setVolume(0.6);
        expect(audio.volume).toBeCloseTo(0.3);
        expect(audioNext.volume).toBeCloseTo(0.3);
        controller.setMuted(true);
        expect(audio.volume + audioNext.volume).toBe(0);
        controller.setMuted(false);
        expect(audio.volume + audioNext.volume).toBeCloseTo(0.6);
        audio.currentTime = 120;
        audio.ended = true;
        audio.paused = true;
        audioNext.currentTime = 5.8;
        audio.__fire("ended");
        expect(audioNext.play).toHaveBeenCalledOnce();
        expect(onAdvance).toHaveBeenCalledExactlyOnceWith({
            durationS: 120, trackId: "track-2", currentTimeS: 5.8,
        });
        expect(ended).not.toHaveBeenCalled();
        expect(internals(controller).audio).toBe(audioNext);
        expect(controller.getSnapshot().currentTime).toBe(5.8);
        expect(controller.getCurrentTime()).toBe(5.8);
        expect(audioNext.volume).toBeCloseTo(0.6);
        expect(audioNext.setAttribute).toHaveBeenCalledWith("data-kima-player", "main");
    });

    it.each(["pause", "seek", "load", "queue-clear", "queue-change", "buffering", "hidden", "off"] as const)(
        "stops and invalidates the incoming deck on %s", async (action) => {
            const { controller, audio, audioNext, sound } = await overlap();
            const onAdvance = vi.fn();
            controller.on("gapless-advance", onAdvance);
            switch (action) {
                case "pause": controller.pause(); break;
                case "seek": controller.seek(40); break;
                case "load": controller.load("http://x.com/c.mp3"); break;
                case "queue-clear": controller.clearExpectedNext(); break;
                case "queue-change": controller.setExpectedNext("http://x.com/c.mp3", "track-3", 120); break;
                case "buffering": audioNext.__fire("waiting"); break;
                case "hidden":
                    Object.assign(document, { visibilityState: "hidden" });
                    vi.advanceTimersByTime(50);
                    break;
                case "off":
                    sound.mockReturnValue({ ...controller.soundLab.getSnapshot(), crossfadeSeconds: 0 });
                    vi.advanceTimersByTime(50);
                    break;
            }
            expect(audioNext.pause).toHaveBeenCalled();
            expect(audioNext.paused).toBe(true);
            expect(audioNext.removeAttribute).toHaveBeenCalledWith("src");
            expect(audio.volume).toBe(1);
            expect(internals(controller).preloadedTrackId).toBeNull();
            expect(onAdvance).not.toHaveBeenCalled();
        },
    );

    it("leaves the outgoing track at full gain when the incoming play rejects", async () => {
        const { controller, audio, audioNext } = setup();
        audioNext.play.mockRejectedValueOnce(new Error("autoplay denied"));
        audio.__fire("timeupdate");
        await flushMicrotasks();
        expect(audio.volume).toBe(1);
        expect(internals(controller).preloadedTrackId).toBeNull();
        expect(audioNext.pause).toHaveBeenCalled();
        const ended = vi.fn();
        controller.on("ended", ended);
        audio.currentTime = 120;
        audio.ended = true;
        audio.__fire("ended");
        expect(ended).toHaveBeenCalledOnce();
    });

    const timing = {
        outgoingId: "track-1", incomingId: "track-2", targetSeconds: 6,
        timing: { overlapMs: 6120, incomingFirstBeatMs: 370,
            outgoingBeatBeforeEndMs: 5750, matchedBeats: 11, maxDriftMs: 0 },
    };

    async function beatSetup() {
        const state = setup(6, true);
        const { controller, audio } = state;
        audio.currentTime = 113;
        const report = vi.spyOn(controller.soundLab, "reportBeatTiming");
        const loader = vi.fn(async () => timing);
        controller.prepareDjTiming("track-1", "track-2", loader);
        await flushMicrotasks();
        return { ...state, report, loader };
    }

    it("looks up one exact pair and waits for the measured cue, not the fixed overlap", async () => {
        const { controller, audio, audioNext, report, loader } = await beatSetup();
        expect(loader).toHaveBeenCalledOnce();
        expect(loader).toHaveBeenCalledWith({ outgoingId: "track-1", incomingId: "track-2", targetSeconds: 6 }, expect.any(AbortSignal));
        controller.prepareDjTiming("track-1", "track-2", loader);
        expect(loader).toHaveBeenCalledOnce();
        expect(audioNext.play).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith("ready");
        audio.currentTime = 113.9;
        vi.advanceTimersByTime(20);
        await flushMicrotasks();
        expect(audioNext.play).toHaveBeenCalledOnce();
        audio.currentTime = 114.4;
        audioNext.currentTime = 0.52;
        vi.advanceTimersByTime(50);
        expect(report).toHaveBeenCalledWith("guided");
        expect(audio.volume).toBeLessThan(1);
        expect(audioNext.volume).toBeGreaterThan(0);
        expect(audio.volume + audioNext.volume).toBeCloseTo(1);
        expect(audioNext.playbackRate).toBe(1);
    });

    it("degrades a guided overlap to a regular fade when observed media timing drifts", async () => {
        const { audio, audioNext, report } = await beatSetup();
        audio.currentTime = 113.9;
        vi.advanceTimersByTime(20);
        await flushMicrotasks();
        audio.currentTime = 114.5;
        audioNext.currentTime = 0.55;
        vi.advanceTimersByTime(50);
        expect(report).toHaveBeenCalledWith("guided");
        audio.currentTime = 115.5;
        audioNext.currentTime = 1;
        vi.advanceTimersByTime(50);
        expect(report).toHaveBeenLastCalledWith("fallback");
        expect(audioNext.play).toHaveBeenCalledOnce();
        expect(audioNext.pause).not.toHaveBeenCalled();
        expect(audio.volume + audioNext.volume).toBeCloseTo(1);
    });

    it("uses a regular transition when a cue deadline was missed", async () => {
        const { audio, audioNext, report } = await beatSetup();
        audio.currentTime = 114.3;
        vi.advanceTimersByTime(20);
        await flushMicrotasks();
        expect(audioNext.play).toHaveBeenCalledOnce();
        expect(report).toHaveBeenLastCalledWith("fallback");
    });

    it("ignores a late response after the next track changes and aborts its request", async () => {
        const { controller, audio, audioNext } = setup(6, true);
        audio.currentTime = 110;
        let resolve: (value: unknown) => void = () => {};
        let signal: AbortSignal | undefined;
        controller.prepareDjTiming("track-1", "track-2", (_pair, requestSignal) => {
            signal = requestSignal;
            return new Promise(done => { resolve = done; });
        });
        controller.setExpectedNext("http://x.com/api/library/tracks/track-3/stream", "track-3", 120);
        expect(signal?.aborted).toBe(true);
        resolve(timing);
        await flushMicrotasks();
        audio.currentTime = 113.9;
        audio.__fire("timeupdate");
        expect(audioNext.play).not.toHaveBeenCalled();
    });

    it("does not request timing for a stale current track or when beat mode is off", () => {
        const { controller, sound } = setup(6, true);
        const loader = vi.fn(async () => timing);
        controller.prepareDjTiming("wrong-track", "track-2", loader);
        expect(loader).not.toHaveBeenCalled();
        sound.mockReturnValue({ ...controller.soundLab.getSnapshot(), beatGuided: false });
        controller.prepareDjTiming("track-1", "track-2", loader);
        expect(loader).not.toHaveBeenCalled();
    });

    it("times out a timing request and continues the ordinary crossfade without retry loops", async () => {
        const { controller, audio, audioNext } = setup(6, true);
        audio.currentTime = 105;
        let signal: AbortSignal | undefined;
        const loader = vi.fn((_pair: unknown, requestSignal: AbortSignal) => {
            signal = requestSignal;
            return new Promise<unknown>(() => {});
        });
        controller.prepareDjTiming("track-1", "track-2", loader);
        for (let second = 1; second <= 5; second++) {
            audio.currentTime = 105 + second;
            vi.advanceTimersByTime(1000);
        }
        expect(signal?.aborted).toBe(true);
        controller.prepareDjTiming("track-1", "track-2", loader);
        expect(loader).toHaveBeenCalledOnce();
        audio.currentTime = 114;
        audio.__fire("timeupdate");
        await flushMicrotasks();
        expect(audioNext.play).toHaveBeenCalledOnce();
    });

    it("cancels a scheduled cue when the current source is replaced", async () => {
        const { controller, audio, audioNext } = await beatSetup();
        controller.load("http://x.com/api/library/tracks/track-4/stream");
        audio.currentTime = 113.9;
        vi.advanceTimersByTime(20);
        await flushMicrotasks();
        expect(audioNext.play).not.toHaveBeenCalled();
    });

    it("does not commit an old play promise after cancellation", async () => {
        const { controller, audio, audioNext } = setup();
        let resolve: () => void = () => {};
        audioNext.play.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
        const advance = vi.fn();
        controller.on("gapless-advance", advance);
        audio.__fire("timeupdate");
        controller.pause();
        resolve();
        await flushMicrotasks();
        expect(audioNext.pause).toHaveBeenCalled();
        expect(advance).not.toHaveBeenCalled();
        expect(audio.volume).toBe(1);
    });
});
