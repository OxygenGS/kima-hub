import { eqPreamp, sanitizeSoundLab, type SoundLabSettings } from "./sound-lab-policy";

/** Both playback decks feed this fixed topology. Gain selectors provide a
 * dry route and optional night compression without reconnecting media sources.
 * The caller owns the AudioContext and the destination.
 */
export function createSoundLabGraph(context: BaseAudioContext, initial: SoundLabSettings) {
    const input = context.createGain();
    const dry = context.createGain();
    const preamp = context.createGain();
    const low = context.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    const mid = context.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    const high = context.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.25;
    const normal = context.createGain();
    const night = context.createGain();
    const output = context.createGain();
    const meter = context.createAnalyser();
    meter.fftSize = 1024;
    const samples = new Float32Array(meter.fftSize);

    input.connect(dry);
    dry.connect(output);
    input.connect(preamp);
    preamp.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(normal);
    normal.connect(output);
    high.connect(compressor);
    compressor.connect(night);
    night.connect(output);
    output.connect(meter);

    // Select exactly one output path. Switch selectors directly (not an
    // overlapping crossfade between differently delayed compressor paths).
    // Smooth EQ and headroom edits to avoid abrupt parameter jumps.
    function update(value: SoundLabSettings, immediate = false): void {
        const settings = sanitizeSoundLab(value);
        const now = context.currentTime;
        const apply = (param: AudioParam, target: number) => {
            param.cancelScheduledValues(now);
            if (immediate) param.setValueAtTime(target, now);
            else param.setTargetAtTime(target, now, 0.025);
        };
        apply(preamp.gain, eqPreamp(settings));
        apply(low.gain, settings.lowDb);
        apply(mid.gain, settings.midDb);
        apply(high.gain, settings.highDb);
        dry.gain.setValueAtTime(settings.enabled ? 0 : 1, now);
        normal.gain.setValueAtTime(settings.enabled && !settings.nightMode ? 1 : 0, now);
        night.gain.setValueAtTime(settings.enabled && settings.nightMode ? 1 : 0, now);
    }
    update(initial, true);
    return {
        input, output, update,
        readPeak(): number {
            meter.getFloatTimeDomainData(samples);
            let peak = 0;
            for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
            return Number.isFinite(peak) ? Math.min(1, peak) : 0;
        },
        dispose() {
            for (const node of [input, dry, preamp, low, mid, high, compressor, normal, night, output, meter]) node.disconnect();
        },
    };
}
