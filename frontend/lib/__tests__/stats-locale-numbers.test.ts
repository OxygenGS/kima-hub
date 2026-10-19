import { describe, expect, it } from "vitest";
import { formatStatsCount, formatStatsOneDecimal } from "@/features/stats/locale-format";

describe("v1.11 Stats numeric display without data mutation", () => {
    it("formats every count in the selected interface language", () => {
        expect(formatStatsCount(0, "nl")).toBe("0");
        expect(formatStatsCount(1, "nl")).toBe("1");
        expect(formatStatsCount(1234, "nl")).toBe("1.234");
        expect(formatStatsCount(1234567, "nl")).toBe("1.234.567");
        expect(formatStatsCount(1234, "en")).toBe("1,234");
        expect(formatStatsCount(1234567, "en")).toBe("1,234,567");
    });
    it("uses local decimal separators on fractional displayed percentages", () => {
        const exact = 12.34;
        expect(formatStatsOneDecimal(exact, "nl")).toBe("12,3");
        expect(formatStatsOneDecimal(exact, "en")).toBe("12.3");
        expect(exact).toBe(12.34);
    });
});
