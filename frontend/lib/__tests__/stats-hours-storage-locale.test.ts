import { describe, expect, it } from "vitest";
import { bytes, hoursValue } from "@/features/stats/format";

describe("v1.11 Stats hours and storage units follow selected UI locale", () => {
    it("formats music and spoken playback hours without modifying seconds", () => {
        const seconds = 5400;
        expect(hoursValue(seconds, "nl")).toBe("1,5");
        expect(hoursValue(seconds, "en")).toBe("1.5");
        expect(hoursValue(seconds)).toBe("1.5");
        expect(hoursValue(3600 * 1234, "nl")).toBe("1.234");
        expect(hoursValue(3600 * 1234, "en")).toBe("1,234");
        expect(seconds).toBe(5400);
    });
    it("formats measured library/cache size while retaining unit and byte quantities", () => {
        const n = 1.5 * 1024 ** 3;
        expect(bytes(n, "nl")).toBe("1,5 GB");
        expect(bytes(n, "en")).toBe("1.5 GB");
        expect(bytes(n)).toBe("1.5 GB");
        expect(bytes(0, "nl")).toBe("0");
        expect(bytes(1024 ** 2 * 1000, "nl")).toBe("1.000 MB");
        expect(n).toBe(1610612736);
    });
});
