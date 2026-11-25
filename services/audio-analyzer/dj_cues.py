"""Compact measured intro/outro windows for DJ planning.

Beat ticks come only from the rhythm extractor, never synthesized from BPM.
The tail window is relative to the decoded end, not the container's duration.
RMS bins describe signal level, not musical phrases, downbeats or LUFS.
"""
import numpy as np

SAMPLE_RATE = 44100
WINDOW_SECONDS = 24
WINDOW_SAMPLES = WINDOW_SECONDS * SAMPLE_RATE
MIN_SECONDS = 8
MAX_BEATS = 128
MIN_CONFIDENCE = 1.0


def edge_window(audio, ticks, confidence, *, tail=False):
    """Return a bounded JSON-safe measurement, or None for unusable samples."""
    if audio.ndim != 1 or len(audio) < MIN_SECONDS * SAMPLE_RATE:
        return None
    start = max(0, len(audio) - WINDOW_SAMPLES) if tail else 0
    edge = audio[start:start + WINDOW_SAMPLES]
    if not np.all(np.isfinite(edge)):
        return None
    window_ms = (len(edge) * 1000 + SAMPLE_RATE - 1) // SAMPLE_RATE
    rms_db = []
    for i in range(0, len(edge), SAMPLE_RATE):
        chunk = edge[i:i + SAMPLE_RATE]
        rms = float(np.sqrt(np.mean(np.square(chunk, dtype=np.float64))))
        rms_db.append(round(max(-90.0, min(0.0, 20 * np.log10(max(1e-9, rms)))), 1))

    measured = []
    tempo = None
    strength = None
    try:
        values = np.asarray(ticks, dtype=np.float64)
        raw_confidence = float(confidence)
        if (values.ndim == 1 and np.all(np.isfinite(values)) and
                np.isfinite(raw_confidence) and MIN_CONFIDENCE <= raw_confidence <= 100 and
                np.all(np.diff(values) > 0) and max(rms_db) > -60):
            # Crop real ticks to this specific window; do not extrapolate.
            relative = values - start / SAMPLE_RATE
            selected = relative[(relative >= 0) & (relative < len(edge) / SAMPLE_RATE)]
            milliseconds = np.rint(selected * 1000).astype(np.int64)
            milliseconds = milliseconds[milliseconds < window_ms]
            intervals = np.diff(milliseconds)
            if 5 <= len(milliseconds) <= MAX_BEATS and np.all(intervals > 0):
                median = float(np.median(intervals))
                # Require regularity in the measured edge itself. Low-confidence
                # or irregular edges still have signal bins, but no DJ beat grid.
                if (200 <= median <= 2000 and
                        np.mean(np.abs(intervals - median) <= median * 0.10) >= 0.85):
                    measured = milliseconds.tolist()
                    tempo = round(60000 / median, 2)
                    strength = round(raw_confidence, 3)
    except (TypeError, ValueError, OverflowError):
        pass
    return {
        "windowMs": window_ms, "beatsMs": measured, "tempoBpm": tempo,
        "confidence": strength, "rmsDb": rms_db,
    }


def make_profile(head, tail):
    if head is None and tail is None:
        return None
    return {"version": 1, "head": head, "tail": tail}
