import { createSoundLabGraph } from "./sound-lab-graph";
import { FLAT_SOUND, sanitizeSoundLab, type SoundLabSettings } from "./sound-lab-policy";

export type SoundLabStatus = "off" | "starting" | "active" | "bypass" | "unsupported" | "interrupted" | "failed";
export interface SoundLabSnapshot {
    settings: SoundLabSettings;
    status: SoundLabStatus;
}
type Graph = ReturnType<typeof createSoundLabGraph>;
const KEY = "kima-sound-lab-device-v1";
const START_TIMEOUT_MS = 2500;
export const DEFAULT_SOUND_LAB: SoundLabSnapshot = { settings: { ...FLAT_SOUND }, status: "off" };

function readSettings(): SoundLabSettings {
    try {
        return { ...sanitizeSoundLab(JSON.parse(localStorage.getItem(KEY) ?? "null")), enabled: false };
    } catch {
        return { ...FLAT_SOUND };
    }
}
function persist(settings: SoundLabSettings): void {
    try {
        // Keep device sound preferences, never silently activate DSP on reload.
        localStorage.setItem(KEY, JSON.stringify({ ...settings, enabled: false }));
    } catch { /* Browser storage is optional. */ }
}

/** The initial rollout is desktop only. In particular, do not attach another
 * MediaElementAudioSourceNode to the existing iOS recovery graph.
 */
export function supportsSoundLab(): boolean {
    if (typeof window === "undefined" || typeof window.AudioContext !== "function" || typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return !/iPhone|iPad|iPod|Android|Mobile/i.test(ua) &&
        !(/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}
function closeContext(context: AudioContext): void {
    try { void context.close().catch(() => {}); } catch { /* Already closed. */ }
}

/**
 * Owns an optional desktop-only Web Audio session. Both elements stay attached
 * across a gapless pointer swap. Off by default; no native-player modification
 * until explicit activation succeeds. After attachment, bypass is a dry Web
 * Audio route until the controller is destroyed (media sources cannot be
 * detached back into native output). Do not close an attached context on disable.
 */
export class SoundLabSession {
    private snapshot: SoundLabSnapshot = { settings: readSettings(), status: "off" };
    private listeners = new Set<() => void>();
    private context: AudioContext | null = null;
    private graph: Graph | null = null;
    private sources: MediaElementAudioSourceNode[] = [];
    private pending: { context: AudioContext; graph: Graph; cancel: () => void } | null = null;
    private broken = false;
    private destroyed = false;
    private resuming = false;

    constructor(
        private readonly elements: readonly [HTMLMediaElement, HTMLMediaElement],
        private readonly onInterrupted: () => void,
    ) {}

    getSnapshot = (): SoundLabSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private publish(settings: SoundLabSettings, status: SoundLabStatus): void {
        this.snapshot = { settings, status };
        this.listeners.forEach(listener => listener());
    }

    private onContextState = (): void => {
        const context = this.context;
        if (!context || this.destroyed) return;
        if (context.state !== "running") {
            this.publish(this.snapshot.settings, context.state === "closed" || this.broken ? "failed" : "interrupted");
            this.onInterrupted();
        } else {
            this.publish(this.snapshot.settings, this.broken ? "failed" : this.snapshot.settings.enabled ? "active" : "bypass");
        }
    };

    /** Native output is safe before attachment; after attachment, do not let
     * a suspended/closed graph silently advance the media timeline.
     */
    canOutput(): boolean {
        return !this.broken && (!this.context || this.context.state === "running");
    }

    readPeak(): number {
        return this.canOutput() && this.graph ? this.graph.readPeak() : 0;
    }

    resume(): void {
        const context = this.context;
        if (!context || this.destroyed || this.resuming || context.state === "running" || context.state === "closed") return;
        this.resuming = true;
        try {
            void context.resume().catch(() => {}).finally(() => {
                this.resuming = false;
            });
        } catch { this.resuming = false; }
    }

    private cancelPending(): void {
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        pending.cancel();
        pending.graph.dispose();
        closeContext(pending.context);
    }

    async apply(value: SoundLabSettings): Promise<void> {
        if (this.destroyed) return;
        const settings = sanitizeSoundLab(value);
        persist(settings);

        if (!settings.enabled) {
            this.cancelPending();
            this.graph?.update(settings, true);
            this.publish(settings, this.broken || this.context?.state === "closed" ? "failed" : !this.context ? "off" : this.context.state === "running" ? "bypass" : "interrupted");
            this.resume();
            return;
        }
        if (!supportsSoundLab()) {
            this.publish({ ...settings, enabled: false }, "unsupported");
            return;
        }
        if (this.broken || this.context?.state === "closed") {
            this.publish({ ...settings, enabled: false }, "failed");
            return;
        }
        if (this.context && this.graph) {
            this.graph.update(settings, !this.snapshot.settings.enabled);
            this.publish(settings, this.context.state === "running" ? "active" : "interrupted");
            this.resume();
            return;
        }
        if (this.pending) return;
        let context: AudioContext | null = null;
        let graph: Graph | null = null;
        try {
            context = new window.AudioContext();
            // Construct a fully connected dry path before touching media.
            graph = createSoundLabGraph(context, { ...settings, enabled: false });
            graph.output.connect(context.destination);
        } catch {
            graph?.dispose();
            if (context) closeContext(context);
            this.publish({ ...settings, enabled: false }, "failed");
            return;
        }

        let cancel = () => {};
        const cancelled = new Promise<boolean>(resolve => { cancel = () => resolve(false); });
        const pending = { context, graph, cancel };
        this.pending = pending;
        this.publish(settings, "starting");
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let running = false;
        try {
            // resume() is called from the activating user gesture, before await.
            const resume = context.resume().then(() => context.state === "running", () => false);
            const deadline = new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), START_TIMEOUT_MS); });
            running = await Promise.race([resume, deadline, cancelled]);
        } catch { /* Constructor/resume may be rejected by the platform. */ }
        finally { if (timeout !== undefined) clearTimeout(timeout); }
        if (this.destroyed || this.pending !== pending) return;
        this.pending = null;
        if (!running || context.state !== "running") {
            graph.dispose();
            closeContext(context);
            this.publish({ ...settings, enabled: false }, "failed");
            return;
        }

        // Once a source is created, the element cannot go back to bare native
        // output. Keep a dry route even if attaching the second element fails.
        try {
            for (const element of this.elements) {
                const source = context.createMediaElementSource(element);
                this.sources.push(source);
                try {
                    source.connect(graph.input);
                } catch (error) {
                    // Last-resort dry route for an already-attached element.
                    source.connect(context.destination);
                    throw error;
                }
            }
        } catch {
            if (!this.sources.length) {
                graph.dispose();
                closeContext(context);
                this.publish({ ...settings, enabled: false }, "failed");
                return;
            }
            this.broken = true;
            this.context = context;
            this.graph = graph;
            context.addEventListener("statechange", this.onContextState);
            graph.update({ ...settings, enabled: false }, true);
            this.publish({ ...settings, enabled: false }, "failed");
            // If routing was only partially established, require an explicit
            // reload rather than claiming that processed output is available.
            this.onInterrupted();
            return;
        }
        this.context = context;
        this.graph = graph;
        context.addEventListener("statechange", this.onContextState);
        graph.update(settings, true);
        this.onContextStateWith(settings);
    }

    private onContextStateWith(settings: SoundLabSettings): void {
        this.publish(settings, this.context?.state === "running" ? "active" : "interrupted");
        if (!this.canOutput()) this.onInterrupted();
    }

    destroy(): void {
        this.destroyed = true;
        this.cancelPending();
        this.context?.removeEventListener("statechange", this.onContextState);
        for (const source of this.sources) source.disconnect();
        this.sources = [];
        this.graph?.dispose();
        if (this.context) closeContext(this.context);
        this.context = null;
        this.graph = null;
        this.listeners.clear();
    }
}
