/**
 * Capture middleware options without making thousands of HTTP requests.
 * The library router still authenticates before this image-specific limiter.
 */
jest.mock("express-rate-limit", () => ({
    __esModule: true,
    default: (options: unknown) => options,
}));

import { apiLimiter, authLimiter, imageLimiter, webhookLimiter } from "../rateLimiter";

function config(middleware: unknown): { windowMs: number; max: number; message: string; skip?: unknown } {
    return middleware as { windowMs: number; max: number; message: string; skip?: unknown };
}

describe("image request rate limit", () => {
    it("supports cover-heavy navigation without disabling the abuse budget", () => {
        expect(config(imageLimiter)).toMatchObject({
            windowMs: 60_000,
            max: 3_000,
            message: "Too many image requests, please slow down.",
        });
        expect(config(imageLimiter).skip).toBeUndefined();
    });

    it("does not weaken unrelated API, login and webhook limits", () => {
        expect(config(apiLimiter).max).toBe(5_000);
        expect(config(authLimiter).max).toBe(20);
        expect(config(webhookLimiter).max).toBe(120);
    });
});
