import express from "express";
import request from "supertest";

jest.mock("../../middleware/auth", () => ({
    requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
    requireMusicPermission: (permission: string) =>
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (permission !== "canDownloadTracks") return res.status(500).end();
            return req.header("x-test-download-allowed") === "true"
                ? next()
                : res.status(403).json({ error: "Music download permission required" });
        },
}));
jest.mock("../../utils/db", () => ({
    prisma: {
        userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
        album: { findUnique: jest.fn().mockResolvedValue(null) },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import offlineRoutes from "../offline";
import { prisma } from "../../utils/db";

const app = express();
app.use(express.json());
app.use("/offline", (req, _res, next) => {
    req.user = { id: "listener", username: "listener", role: "user" };
    next();
}, offlineRoutes);

describe("offline album download permission", () => {
    beforeEach(() => jest.clearAllMocks());

    it("denies download metadata to a user without download permission", async () => {
        const res = await request(app).post("/offline/albums/album-1/download").send({});
        expect(res.status).toBe(403);
        expect(prisma.album.findUnique).not.toHaveBeenCalled();
    });

    it("permits the request to reach the album lookup when granted", async () => {
        const res = await request(app)
            .post("/offline/albums/album-1/download")
            .set("x-test-download-allowed", "true")
            .send({});
        expect(res.status).toBe(404);
        expect(prisma.album.findUnique).toHaveBeenCalledTimes(1);
    });
});
