import { describe, expect, it } from "vitest";
import { hourLabel, whenLabel, monthYear, monthLabel, monthLong, ordinal } from "./format";

describe("Stats locale-specific time labels", () => {
    it("formats Dutch chart month labels and player play counts", () => {
        expect(monthLabel("2026-05", "nl")).toBe("mei 26");
        expect(monthLong("2026-10", "nl")).toBe("oktober 2026");
        expect(monthLabel("2026-05")).toBe("may 26");
        expect(monthLong("2026-10")).toBe("october 2026");
        expect(ordinal(45, "nl")).toBe("45e");
        expect(ordinal(45)).toBe("45th");
    });

    it("keeps the existing English output by default", () => {
        expect(hourLabel(0)).toBe("12am");
        expect(hourLabel(21)).toBe("9pm");
        expect(whenLabel(4, 21)).toBe("thursday 9pm");
    });

    it("uses Dutch weekdays and 24-hour clock for Dutch UI", () => {
        expect(hourLabel(0, "nl")).toBe("00:00");
        expect(hourLabel(21, "nl")).toBe("21:00");
        expect(whenLabel(4, 21, "nl")).toBe("donderdag 21:00");
        expect(whenLabel(0, 0, "nl")).toBe("zondag 00:00");
    });

    it("follows explicit language selection for month display", () => {
        const date = "2025-09-15T12:00:00Z";
        expect(monthYear(date, "nl")).toBe("september 2025");
        expect(monthYear(date, "en")).toBe("september 2025");
        expect(monthYear(null, "nl")).toBe("");
        expect(monthYear("2025-05-15T12:00:00Z", "nl")).toBe("mei 2025");
        expect(monthYear("2025-05-15T12:00:00Z", "en")).toBe("may 2025");
    });
});
