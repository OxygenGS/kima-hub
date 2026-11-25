import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSoundLabGraph } from "../sound-lab-graph";
import { SoundLabSession } from "../sound-lab-session";
import { FLAT_SOUND, sanitizeSoundLab } from "../sound-lab-policy";

class Param {
    value = 0;
    cancelScheduledValues = vi.fn();
    setValueAtTime = vi.fn((value: number) => { this.value = value; });
    setTargetAtTime = vi.fn((value: number) => { this.value = value; });
}
class Node {
    gain = new Param();
    frequency = new Param();
    Q = new Param();
    threshold = new Param();
    knee = new Param();
    ratio = new Param();
    attack = new Param();
    release = new Param();
    type = "";
    fftSize = 1024;
    connect = vi.fn();
    disconnect = vi.fn();
    getFloatTimeDomainData = vi.fn((data: Float32Array) => { data.fill(0.125); });
}
class Context extends EventTarget {
    static instances: Context[] = [];
    static failSourceAt = 0;
    static resumeFailure = false;
    static stallResume = false;
    state: AudioContextState = "suspended";
    currentTime = 0;
    destination = new Node();
    gains: Node[] = [];
    filters: Node[] = [];
    sources: Node[] = [];
    compressors: Node[] = [];
    meters: Node[] = [];
    close = vi.fn(async () => { this.state = "closed"; });
    resume = vi.fn(async () => {
        if (Context.resumeFailure) throw new Error("resume denied");
        if (Context.stallResume) await new Promise<void>(() => {});
        this.state = "running";
        this.dispatchEvent(new Event("statechange"));
    });
    constructor() {
        super();
        Context.instances.push(this);
    }
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createBiquadFilter() { const node = new Node(); this.filters.push(node); return node; }
    createDynamicsCompressor() { const node = new Node(); this.compressors.push(node); return node; }
    createAnalyser() { const node = new Node(); this.meters.push(node); return node; }
    createMediaElementSource() {
        if (Context.failSourceAt === this.sources.length + 1) throw new Error("source attachment failed");
        const node = new Node();
        this.sources.push(node);
        return node;
    }
    interrupt() {
        this.state = "suspended";
        this.dispatchEvent(new Event("statechange"));
    }
}
const settings = (patch = {}) => sanitizeSoundLab({ ...FLAT_SOUND, enabled: true, ...patch });
const storage = new Map<string, string>();
const newSession = (interrupt = vi.fn()) => ({
    interrupt,
    session: new SoundLabSession([{} as HTMLMediaElement, {} as HTMLMediaElement], interrupt),
});
beforeEach(() => {
    Context.instances = [];
    Context.failSourceAt = 0;
    Context.resumeFailure = false;
    Context.stallResume = false;
    storage.clear();
    vi.stubGlobal("window", { AudioContext: Context });
    vi.stubGlobal("navigator", { userAgent: "Desktop Chrome", maxTouchPoints: 0 });
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    });
});
afterEach(() => vi.unstubAllGlobals());

describe("Sound Lab fixed graph", () => {
    it("selects exactly one dry, processed or compressed output and reads actual analyser samples", () => {
        const context = new Context();
        const graph = createSoundLabGraph(context as unknown as BaseAudioContext, FLAT_SOUND);
        const [input, dry, preamp, normal, night, output] = context.gains;
        const selectors = () => [dry.gain.value, normal.gain.value, night.gain.value];
        expect(selectors()).toEqual([1, 0, 0]);
        expect(input.connect).toHaveBeenCalledWith(dry);
        expect(input.connect).toHaveBeenCalledWith(preamp);
        expect(output.connect).toHaveBeenCalledWith(context.meters[0]);
        graph.update(settings({ preset: "bass" }));
        expect(selectors()).toEqual([0, 1, 0]);
        expect(context.filters[0].gain.value).toBe(4);
        expect(preamp.gain.value).toBeLessThan(1);
        graph.update(settings({ preset: "voice", nightMode: true }));
        expect(selectors()).toEqual([0, 0, 1]);
        expect(context.filters[1].gain.value).toBe(3);
        expect(graph.readPeak()).toBeCloseTo(0.125, 5);
        graph.update(FLAT_SOUND);
        expect(selectors()).toEqual([1, 0, 0]);
        graph.dispose();
        expect(output.disconnect).toHaveBeenCalledOnce();
        expect(context.meters[0].disconnect).toHaveBeenCalledOnce();
    });
});

describe("Sound Lab desktop session", () => {
    it("does not create a context until explicitly enabled and persists preferences with activation off", async () => {
        const { session } = newSession();
        await session.apply({ ...settings({ preset: "warm" }), enabled: false });
        expect(Context.instances).toHaveLength(0);
        const next = newSession().session;
        expect(next.getSnapshot().settings).toMatchObject({ enabled: false, preset: "warm", lowDb: 2 });
        expect(next.canOutput()).toBe(true);
        next.destroy();
        session.destroy();
    });
    it("attaches both decks once, updates live and bypasses without closing the attached context", async () => {
        const { session } = newSession();
        const changed = vi.fn();
        const unsubscribe = session.subscribe(changed);
        await session.apply(settings({ preset: "bass" }));
        const context = Context.instances[0];
        expect(session.getSnapshot().status).toBe("active");
        expect(context.sources).toHaveLength(2);
        expect(context.sources.every(source => source.connect.mock.calls.length === 1)).toBe(true);
        expect(session.readPeak()).toBeCloseTo(0.125, 5);
        await session.apply(settings({ preset: "voice", nightMode: true }));
        expect(Context.instances).toHaveLength(1);
        expect(context.sources).toHaveLength(2);
        await session.apply({ ...settings({ preset: "voice" }), enabled: false });
        expect(session.getSnapshot().status).toBe("bypass");
        expect(context.close).not.toHaveBeenCalled();
        expect(session.canOutput()).toBe(true);
        expect(changed).toHaveBeenCalled();
        unsubscribe();
        session.destroy();
        expect(context.close).toHaveBeenCalledOnce();
        expect(context.sources.every(source => source.disconnect.mock.calls.length === 1)).toBe(true);
    });
    it("keeps crossfade opt-in, bounded, and unavailable before a graph is running", async () => {
        const { session } = newSession();
        expect(session.getSnapshot().crossfadeSeconds).toBe(0);
        session.setCrossfadeSeconds(8);
        expect(session.getSnapshot().crossfadeSeconds).toBe(0);
        await session.apply(settings());
        session.setCrossfadeSeconds(6);
        expect(session.getSnapshot().crossfadeSeconds).toBe(6);
        await session.apply(FLAT_SOUND);
        expect(session.getSnapshot().status).toBe("bypass");
        expect(session.getSnapshot().crossfadeSeconds).toBe(6);
        session.setCrossfadeSeconds(40);
        expect(session.getSnapshot().crossfadeSeconds).toBe(0);
        session.setCrossfadeSeconds(4);
        const next = newSession().session;
        expect(next.getSnapshot().crossfadeSeconds).toBe(0);
        session.destroy();
        next.destroy();
    });
    it("does not allocate or attach on mobile/iOS", async () => {
        vi.stubGlobal("navigator", { userAgent: "iPhone Mobile", maxTouchPoints: 5 });
        const { session } = newSession();
        await session.apply(settings());
        expect(session.getSnapshot().status).toBe("unsupported");
        expect(Context.instances).toHaveLength(0);
        expect(session.canOutput()).toBe(true);
        session.destroy();
    });
    it("leaves native output available when resume is denied before attachment", async () => {
        Context.resumeFailure = true;
        const { session, interrupt } = newSession();
        await session.apply(settings());
        expect(session.getSnapshot().status).toBe("failed");
        expect(Context.instances[0].sources).toHaveLength(0);
        expect(Context.instances[0].close).toHaveBeenCalledOnce();
        expect(session.canOutput()).toBe(true);
        expect(interrupt).not.toHaveBeenCalled();
        session.destroy();
    });
    it("cancels a pending activation without attaching a media source", async () => {
        Context.stallResume = true;
        const { session } = newSession();
        const pending = session.apply(settings());
        expect(session.getSnapshot().status).toBe("starting");
        await session.apply(FLAT_SOUND);
        await pending;
        expect(session.getSnapshot().status).toBe("off");
        expect(Context.instances[0].sources).toHaveLength(0);
        expect(Context.instances[0].close).toHaveBeenCalledOnce();
        session.destroy();
    });
    it("signals interruption, blocks silent playback and resumes the context without starting media", async () => {
        const { session, interrupt } = newSession();
        await session.apply(settings());
        const context = Context.instances[0];
        context.interrupt();
        expect(session.getSnapshot().status).toBe("interrupted");
        expect(session.canOutput()).toBe(false);
        expect(interrupt).toHaveBeenCalledOnce();
        expect(session.readPeak()).toBe(0);
        session.resume();
        await Promise.resolve();
        expect(session.getSnapshot().status).toBe("active");
        expect(session.canOutput()).toBe(true);
        session.destroy();
    });
    it("retains the dry context but blocks playback after partial attachment failure until reload", async () => {
        Context.failSourceAt = 2;
        const { session, interrupt } = newSession();
        await session.apply(settings());
        const context = Context.instances[0];
        expect(session.getSnapshot().status).toBe("failed");
        expect(session.getSnapshot().settings.enabled).toBe(false);
        expect(context.sources).toHaveLength(1);
        expect(context.close).not.toHaveBeenCalled();
        expect(session.canOutput()).toBe(false);
        expect(interrupt).toHaveBeenCalledOnce();
        await session.apply(settings());
        expect(Context.instances).toHaveLength(1);
        session.destroy();
        expect(context.close).toHaveBeenCalledOnce();
    });
});
