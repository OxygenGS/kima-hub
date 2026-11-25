/** Real database/authenticated DJ preview, including fresh and stale measured cue rows. */
import express from "express";
import request from "supertest";
import { prisma } from "../../utils/db";
import { generateToken } from "../../middleware/auth";
import vibeRouter from "../vibe";
import { redisClient } from "../../utils/redis";
import { closeClient } from "../../utils/closeRedisClient";

const P = "cdjcue";
const modified = new Date("2026-01-01T00:00:00Z");
const analyzed = new Date("2026-01-02T00:00:00Z");
const edge = (first: number) => ({
    windowMs: 24000,
    beatsMs: Array.from({ length: 48 }, (_, i) => first + i * 500).filter(tick => tick < 24000),
    tempoBpm: 120, confidence: 3, rmsDb: Array(24).fill(-16),
});

async function cleanup() {
    await prisma.track.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.album.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.artist.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
}
let token: string;
beforeAll(async () => {
    await cleanup();
    const user = await prisma.user.create({ data: { id: P + "user", username: P + "user", passwordHash: "x", role: "user" } });
    token = generateToken(user);
    await prisma.artist.create({ data: { id: P + "artist", name: "DJ cue fixture", identityKey: P + "artist" } });
    await prisma.album.create({ data: { id: P + "album", artistId: P + "artist", rgMbid: P + "rg", title: "DJ cue fixture", primaryType: "Album", location: "LIBRARY" } });
    for (const [i, suffix] of ["one", "two", "stale", "missing", "corrupt"].entries()) {
        const id = P + suffix;
        const filePath = "ci-dj-cues/" + suffix + ".wav";
        await prisma.track.create({ data: {
            id, filePath, fileModified: modified, fileSize: 1000, analyzedAt: analyzed,
            analysisStatus: "completed", albumId: P + "album", title: suffix, trackNo: i + 1,
            duration: 120, bpm: 120, key: "C", keyScale: "major", energy: 0.5,
            moodTags: [], essentiaGenres: [],
            ...(suffix === "missing" ? { missingSince: new Date() } : {}),
            ...(suffix === "corrupt" ? { corrupt: true } : {}),
        } });
        await prisma.trackDjCue.create({ data: {
            trackId: id, sourcePath: filePath, sourceModified: modified,
            sourceSize: suffix === "stale" ? 999 : 1000, sourceAnalyzedAt: analyzed,
            profile: { version: 1, head: edge(370), tail: edge(250) },
        } });
    }
});

afterAll(async () => {
    await cleanup();
    await closeClient(redisClient);
});

const app = express();
app.use(express.json());
app.use("/api/vibe", vibeRouter);

describe("authenticated DJ cue preview", () => {
    it("returns only current measurements and alignment advice, without exposing file identity", async () => {
        const res = await request(app).post("/api/vibe/dj/preview").set("Authorization", "Bearer " + token)
            .send({ trackIds: ["one", "two", "stale", "missing", "corrupt"].map(suffix => P + suffix) });
        expect(res.status).toBe(200);
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(res.body.omittedCount).toBe(2);
        expect(res.body.entries.map((entry: { track: { id: string } }) => entry.track.id)).toEqual([P + "one", P + "two", P + "stale"]);
        expect(res.body.entries[0].cue.head.beatsMs[0]).toBe(370);
        expect(res.body.entries[1].timing).toMatchObject({ incomingFirstBeatMs: 370, maxDriftMs: 0 });
        expect(res.body.entries[2].cue).toBeNull();
        expect(res.body.entries[2].timing).toBeNull();
        expect(JSON.stringify(res.body)).not.toContain("ci-dj-cues/");
        expect(JSON.stringify(res.body)).not.toContain("sourceModified");
    });

    it("requires authentication and a bounded explicit selection", async () => {
        const payload = { trackIds: [P + "one", P + "two"] };
        expect((await request(app).post("/api/vibe/dj/preview").send(payload)).status).toBe(401);
        const invalid = await request(app).post("/api/vibe/dj/preview")
            .set("Authorization", "Bearer " + token).send({ trackIds: Array(61).fill(P + "one") });
        expect(invalid.status).toBe(400);
    });

    it("ignores a cue after the source changes even if a stale row remains", async () => {
        await prisma.track.update({ where: { id: P + "one" }, data: { fileModified: new Date(modified.getTime() + 1000) } });
        try {
            const res = await request(app).post("/api/vibe/dj/preview").set("Authorization", "Bearer " + token)
                .send({ trackIds: [P + "one", P + "two"] });
            expect(res.status).toBe(200);
            expect(res.body.entries[0].cue).toBeNull();
            expect(res.body.entries[1].timing).toBeNull();
        } finally {
            await prisma.track.update({ where: { id: P + "one" }, data: { fileModified: modified } });
        }
    });
});
