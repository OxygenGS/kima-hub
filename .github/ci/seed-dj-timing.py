"""Synthetic ground-truth beat fixtures for the guarded disposable AIO runner.

No extracted confidence is asserted: we know exactly where these generated
pulses were written. The independent native analyzer canary tests Essentia.
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from dj_cues import SAMPLE_RATE, edge_window, make_profile

directory = Path(sys.argv[1])
sr = SAMPLE_RATE
seconds = 48
pulse_t = np.arange(int(0.12 * sr)) / sr
pulse = (np.sin(2 * np.pi * 170 * pulse_t) + 0.4 * np.sin(2 * np.pi * 1300 * pulse_t))
pulse *= np.exp(-pulse_t * 45) * 0.25
for name, first_ms in [("dj-one.wav", 250), ("dj-two.wav", 370)]:
    pcm = np.zeros(seconds * sr, dtype=np.float32)
    ticks = []
    for beat_ms in range(first_ms, seconds * 1000 - 120, 500):
        start = beat_ms * sr // 1000
        pcm[start:start + len(pulse)] = pulse
        ticks.append(start / sr)
    with (directory / name).open("xb") as target:
        with wave.open(target, "wb") as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(sr)
            writer.writeframes((pcm * 32767).astype("<i2").tobytes())
    head = edge_window(pcm, ticks, 3)
    tail = edge_window(pcm, ticks, 3, tail=True)
    assert head and tail and head["beatsMs"] and tail["beatsMs"]
    assert head["beatsMs"][0] == first_ms
    print(json.dumps(make_profile(head, tail), allow_nan=False, separators=(",", ":")))
