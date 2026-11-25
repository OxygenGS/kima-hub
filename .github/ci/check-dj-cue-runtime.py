"""Native-image DJ cue canary, invoked only by the guarded disposable CI fixture."""
import tempfile
import wave
from pathlib import Path

import numpy as np
from analyzer import _decode_dj_intro, _decode_to_stereo
from dj_cues import SAMPLE_RATE, WINDOW_SAMPLES, edge_window
from essentia.standard import RhythmExtractor2013

# Distinct measured intro/outro levels, with short percussive bursts every
# half-second. Check real Essentia ticks, not a fabricated BPM grid.
with tempfile.TemporaryDirectory(prefix="kima-dj-ci-") as directory:
    path = Path(directory) / "generated.wav"
    sr = SAMPLE_RATE
    audio = np.zeros(48 * sr, dtype=np.float32)
    pulse_t = np.arange(int(0.12 * sr)) / sr
    pulse = (np.sin(2 * np.pi * 170 * pulse_t) + 0.4 * np.sin(2 * np.pi * 1300 * pulse_t))
    pulse = pulse * np.exp(-pulse_t * 45)
    for beat in np.arange(0.25, 48, 0.5):
        start = int(beat * sr)
        audio[start:start + len(pulse)] = (0.3 if beat < 24 else 0.06) * pulse
    with wave.open(str(path), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sr)
        writer.writeframes((audio * 32767).astype("<i2").tobytes())
    intro = _decode_dj_intro(str(path), 1)
    assert intro is not None and len(intro) == WINDOW_SAMPLES, "bounded real intro decode"
    decoded, _, channels, duration, _, rc, stderr, _ = _decode_to_stereo(str(path), duration=24)
    assert rc == 0 and not stderr and channels == 1 and decoded is not None
    assert abs(duration - 24) < 0.01
    rhythm = RhythmExtractor2013(method="multifeature")
    for data, tail in [(intro, False), (decoded[0], True)]:
        bpm, ticks, confidence, _, _ = rhythm(data)
        assert np.isfinite(bpm) and len(ticks) >= 5, "real rhythm extractor must measure the fixture"
        measured = edge_window(data, ticks, confidence, tail=tail)
        assert measured is not None and measured["windowMs"] == 24000
        assert len(measured["rmsDb"]) == 24
        # Never force a grid when the estimator is uncertain. If one is
        # returned, every tick must be a measured tick, rounded to ms.
        actual = set(np.rint(np.asarray(ticks, dtype=np.float64) * 1000).astype(int).tolist())
        assert all(tick in actual for tick in measured["beatsMs"])
        if measured["beatsMs"]:
            assert measured["tempoBpm"] is not None
        else:
            assert measured["tempoBpm"] is None
        if not tail:
            head = measured
        else:
            outro = measured
    assert np.median(head["rmsDb"]) > np.median(outro["rmsDb"]) + 10, "distinct real edge levels"
print("Native measured DJ edge decode and rhythm evidence: PASS")
