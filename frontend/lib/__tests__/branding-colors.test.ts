import { describe, expect, it } from "vitest";
import { brandContrastColor } from "../branding-context";

const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((index) => {
        const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground: string, background: string) => {
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe("brandContrastColor", () => {
    it("chooses dark text for light or bright accent colors", () => {
        expect(brandContrastColor("#fca200")).toBe("#000000");
        expect(brandContrastColor("#ffffff")).toBe("#000000");
        expect(brandContrastColor("#a855f7")).toBe("#000000");
    });

    it("chooses white text for darker accent colors", () => {
        expect(brandContrastColor("#000000")).toBe("#ffffff");
        expect(brandContrastColor("#101020")).toBe("#ffffff");
        expect(brandContrastColor("#2563eb")).toBe("#ffffff");
    });

    it("meets WCAG AA for common custom colors", () => {
        const colors = [
            "#fca200", "#a855f7", "#2563eb", "#14b8a6", "#ff0000",
            "#00ff00", "#0000ff", "#7f7f7f", "#808080", "#101020",
        ];
        for (const color of colors) {
            expect(contrastRatio(brandContrastColor(color), color)).toBeGreaterThanOrEqual(4.5);
        }
    });
});
