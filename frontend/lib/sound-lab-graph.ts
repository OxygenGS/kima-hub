import { eqPreamp, sanitizeSoundLab, type SoundLabSettings } from "./sound-lab-policy";

/** A composable EQ graph for a future opt-in music deck. It is deliberately
 * NOT connected to AudioController yet: routing an existing HTMLMediaElement
 * through Web Audio needs browser, CORS, interruption and recovery tests.
 * The caller owns source attachment, context lifetime and destination.
 */
export function createSoundLabGraph(context: BaseAudioContext, initial: SoundLabSettings) {
    const settings = sanitizeSoundLab(initial);
    const input = context.createGain();
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
    const output = context.createGain();
    input.connect(preamp);
    preamp.connect(low);
    low.connect(mid);
    mid.connect(high);
    if (settings.enabled && settings.nightMode) {
        high.connect(compressor);
        compressor.connect(output);
    } else {
        high.connect(output);
    }
    preamp.gain.value = eqPreamp(settings);
    low.gain.value = settings.enabled ? settings.lowDb : 0;
    mid.gain.value = settings.enabled ? settings.midDb : 0;
    high.gain.value = settings.enabled ? settings.highDb : 0;
    return {
        input, output,
        dispose() {
            for (const node of [input, preamp, low, mid, high, compressor, output]) node.disconnect();
        },
    };
}
