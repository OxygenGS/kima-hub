import express from "express";
import request from "supertest";
import sharp from "sharp";

jest.mock("../../utils/db", () => ({
    prisma: {
        brandingSettings: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) =>
        req.header("authorization") ? next() : res.status(401).json({ error: "Not authenticated" }),
    requireAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) =>
        req.header("x-test-role") === "admin" ? next() : res.status(403).json({ error: "Admin access required" }),
}));

import brandingRoutes from "../branding";
import { prisma } from "../../utils/db";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/branding", brandingRoutes);

const admin = (method: "post" | "delete", path: string) =>
    request(app)[method](path).set("Authorization", "Bearer test-token").set("X-Test-Role", "admin");

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.brandingSettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.brandingSettings.upsert as jest.Mock).mockResolvedValue({});
    (prisma.brandingSettings.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
});

describe("instance branding", () => {
    it("returns neutral defaults to unauthenticated listeners", async () => {
        const response = await request(app).get("/branding");
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body).toMatchObject({
            name: "Kima",
            accentColor: "#fca200",
            backgroundColor: "#0a0a0a",
            hasCustomLogo: false,
            hasCustomFavicon: false,
        });
    });

    it("returns customized branding without exposing image bytes", async () => {
        (prisma.brandingSettings.findUnique as jest.Mock).mockResolvedValue({
            name: "My Stream",
            tagline: "A private jukebox",
            accentColor: "#bb55cc",
            backgroundColor: "#101010",
            logoContentType: "image/webp",
            faviconContentType: "image/png",
            updatedAt: new Date("2026-10-12T12:00:00Z"),
            logoData: Buffer.from("secret-image"),
        });
        const response = await request(app).get("/branding");
        expect(response.status).toBe(200);
        expect(response.body.name).toBe("My Stream");
        expect(response.body.logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/);
        expect(response.body.faviconUrl).toMatch(/^\/api\/branding\/favicon\?v=\d+$/);
        expect(response.text).not.toContain("secret-image");
    });

    it("requires an authenticated admin for all changes", async () => {
        expect((await request(app).post("/branding").send({ name: "X" })).status).toBe(401);
        expect((await request(app).post("/branding")
            .set("Authorization", "Bearer test")
            .send({ name: "X" })).status).toBe(403);
        expect((await request(app).delete("/branding")
            .set("Authorization", "Bearer test")).status).toBe(403);
        expect(prisma.brandingSettings.upsert).not.toHaveBeenCalled();
    });

    it("rejects malicious/invalid values", async () => {
        expect((await admin("post", "/branding").send({ accentColor: "red; background:url(evil)" })).status).toBe(400);
        expect((await admin("post", "/branding").send({ logo: "data:image/svg+xml;base64,PHN2Zz4=" })).status).toBe(400);
        expect((await admin("post", "/branding").send({ name: "" })).status).toBe(400);
        expect((await admin("post", "/branding").send({ unseenSetting: "value" })).status).toBe(400);
        expect(prisma.brandingSettings.upsert).not.toHaveBeenCalled();
    });

    it("normalizes uploaded raster logos and persists only re-encoded bytes", async () => {
        const source = await sharp({
            create: { width: 24, height: 24, channels: 4, background: "#993399" },
        }).png().toBuffer();
        const result = await admin("post", "/branding").send({
            name: "My Stream",
            logo: "data:image/png;base64," + source.toString("base64"),
        });
        expect(result.status).toBe(200);
        const args = (prisma.brandingSettings.upsert as jest.Mock).mock.calls[0][0];
        expect(args.update.logoData).toBeInstanceOf(Buffer);
        expect(args.update.logoContentType).toBe("image/webp");
        expect((await sharp(args.update.logoData).metadata()).format).toBe("webp");
    });

    it("allows resetting to defaults", async () => {
        const result = await admin("delete", "/branding");
        expect(result.status).toBe(200);
        expect(result.body.name).toBe("Kima");
        expect(prisma.brandingSettings.deleteMany).toHaveBeenCalledWith({
            where: { id: "default" },
        });
    });
});
