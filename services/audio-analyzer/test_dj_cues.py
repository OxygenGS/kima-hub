import unittest
import json
import numpy as np
from dj_cues import SAMPLE_RATE, edge_window, make_profile


def signal(seconds, amplitude=0.25):
    # Deterministic signal bins; beat times are explicit measured-tick fixtures.
    return np.full(int(seconds * SAMPLE_RATE), amplitude, dtype=np.float32)


class MeasuredDjCueTests(unittest.TestCase):
    def test_tail_uses_actual_decoded_end_not_container_duration(self):
        audio = signal(60)
        ticks = np.arange(0.25, 60, 0.5)
        result = edge_window(audio, ticks, 3, tail=True)
        self.assertEqual(result["windowMs"], 24000)
        self.assertEqual(result["beatsMs"], list(range(250, 24000, 500)))
        self.assertEqual(result["tempoBpm"], 120)
        self.assertEqual(len(result["rmsDb"]), 24)
        self.assertAlmostEqual(result["rmsDb"][0], -12.0, places=1)
        json.dumps(result, allow_nan=False)

    def test_head_keeps_real_initial_phase(self):
        result = edge_window(signal(40), np.arange(0.37, 40, 0.6), 2)
        self.assertEqual(result["beatsMs"][:3], [370, 970, 1570])
        self.assertEqual(result["tempoBpm"], 100)
        self.assertEqual(result["windowMs"], 24000)

    def test_silence_low_confidence_and_irregular_ticks_never_fake_beats(self):
        for audio, ticks, confidence in [
            (signal(12, 0), np.arange(0.25, 12, 0.5), 4),
            (signal(12), np.arange(0.25, 12, 0.5), 0.1),
            (signal(12), [0.1, 0.2, 1, 1.1, 2.5, 4, 4.3, 8, 9], 5),
            (signal(12), [0, 1, float("nan"), 3, 4], 5),
            (signal(12), [0, 1, 1, 2, 3, 4], 5),
        ]:
            result = edge_window(audio, ticks, confidence)
            self.assertEqual(result["beatsMs"], [])
            self.assertIsNone(result["tempoBpm"])
            self.assertIsNone(result["confidence"])
            self.assertEqual(len(result["rmsDb"]), 12)

    def test_rms_bins_show_a_real_fade_without_claiming_phrase_boundaries(self):
        audio = np.concatenate([signal(8), signal(8, 0.025), signal(8, 0)])
        result = edge_window(audio, [], None)
        self.assertEqual(result["rmsDb"][:8], [-12.0] * 8)
        self.assertEqual(result["rmsDb"][8:16], [-32.0] * 8)
        self.assertEqual(result["rmsDb"][16:], [-90.0] * 8)

    def test_short_and_nonfinite_windows_are_unknown(self):
        self.assertIsNone(edge_window(signal(3), [], None))
        audio = signal(10)
        audio[5] = np.nan
        self.assertIsNone(edge_window(audio, [], None))
        self.assertIsNone(make_profile(None, None))
        self.assertEqual(make_profile(None, {"windowMs": 10000}),
                         {"version": 1, "head": None, "tail": {"windowMs": 10000}})


if __name__ == "__main__":
    unittest.main()
