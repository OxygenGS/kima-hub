import express from "express";
import request from "supertest";

const discover = jest.fn();
const spotlight = jest.fn();

jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, res: any, next: any) => {
        const owner = req.headers["x-test-user"];
        if (!owner) return res.status(401).json({ error: "Unauthorized" });
        req.user = { id: owner };
        next();
    },
}));
jest.mock("../../services/novaFlowDiscovery", () => ({
    buildNovaDiscovery: (...args: unknown[]) => discover(...args),
    buildNovaAlbumSpotlight: (...args: unknown[]) => spotlight(...args),
}));
jest.mock("../../services/novaFlow", () => ({ buildNovaFlow: jest.fn() }));
jest.mock("../../services/novaFlowFeedback", () => ({
    setNovaFlowFeedback: jest.fn(),
    clearNovaFlowFeedback: jest.fn(),
}));

import vibeRouter from "../vibe";

const app = express();
app.use(express.json());
app.use("/api/vibe", vibeRouter);

beforeEach(() => {
    jest.clearAllMocks();
    spotlight.mockResolvedValue({
        artistMbid: "550e8400-e29b-41d4-a716-446655440000",
        albums: [{ id: "550e8400-e29b-41d4-a716-446655440001", title: "Example album", type: "Album", year: 2020 }],
        sourceFailed: false, readOnly: true,
    });
    discover.mockResolvedValue({
        unavailableSeed: false, seedArtist: "Example",
        artists: [{ name: "Another", mbid: null, match: 0.9 }],
        sourceFailed: false,
    });
});

describe("NOVA Discovery Radar read-only endpoint", () => {
    it("requires authentication and does not issue discovery to anonymous users", async () => {
        await request(app).get("/api/vibe/flow/discover?seedTrackId=t1").expect(401);
        expect(discover).not.toHaveBeenCalled();
    });

    it("strictly validates seed and limit, rejecting extraneous parameters", async () => {
        const invalid = [
            "", "?seedTrackId=", "?seedTrackId=t1&limit=0",
            "?seedTrackId=t1&limit=13", "?seedTrackId=t1&limit=2.5",
            "?seedTrackId=t1&limit=x", "?seedTrackId=t1&userId=bob",
            "?seedTrackId=t1&limit=1&limit=2",
        ];
        for (const query of invalid) {
            await request(app).get("/api/vibe/flow/discover" + query)
                .set("x-test-user", "alice").expect(400);
        }
        expect(discover).not.toHaveBeenCalled();
    });

    it("returns only verified artist suggestions and no-store headers", async () => {
        const response = await request(app)
            .get("/api/vibe/flow/discover?seedTrackId=t1&limit=5")
            .set("x-test-user", "alice").expect(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(discover).toHaveBeenCalledWith("t1", 5);
        expect(response.body).toEqual({
            seedArtist: "Example",
            artists: [{ name: "Another", mbid: null, match: 0.9 }],
            sourceFailed: false,
        });
    });

    it("does not manufacture discovery artists if the seed is no longer playable", async () => {
        discover.mockResolvedValueOnce({
            unavailableSeed: true, seedArtist: null, artists: [], sourceFailed: false,
        });
        const response = await request(app)
            .get("/api/vibe/flow/discover?seedTrackId=missing")
            .set("x-test-user", "alice").expect(404);
        expect(response.body.error).toMatch(/not playable/);
    });

    it("does not turn an external-source error into a fabricated empty successful list", async () => {
        discover.mockRejectedValueOnce(new Error("external service down"));
        await request(app).get("/api/vibe/flow/discover?seedTrackId=t1")
            .set("x-test-user", "alice").expect(503);
    });
});


describe("NOVA Album Spotlight authenticated read-only endpoint", () => {
    const artistMbid = "550e8400-e29b-41d4-a716-446655440000";
    const route = "/api/vibe/flow/discover/albums";

    it("never fetches albums for anonymous requests", async () => {
        await request(app).get(route + "?artistMbid=" + artistMbid).expect(401);
        expect(spotlight).not.toHaveBeenCalled();
    });

    it("rejects unknown parameters and missing or malformed MBIDs", async () => {
        const invalid = [
            "", "?artistMbid=invalid", "?artistMbid=" + artistMbid + "&limit=0",
            "?artistMbid=" + artistMbid + "&limit=5",
            "?artistMbid=" + artistMbid + "&limit=2.3",
            "?artistMbid=" + artistMbid + "&userId=other",
            "?artistMbid=" + artistMbid + "&artistMbid=" + artistMbid,
        ];
        for (const query of invalid) {
            await request(app).get(route + query).set("x-test-user", "alice").expect(400);
        }
        expect(spotlight).not.toHaveBeenCalled();
    });

    it("serves bounded album evidence without download or state changes", async () => {
        const res = await request(app).get(route + "?artistMbid=" + artistMbid + "&limit=2")
            .set("x-test-user", "alice").expect(200);
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(spotlight).toHaveBeenCalledWith(artistMbid, 2);
        expect(res.body).toEqual({
            artistMbid,
            albums: [{ id: "550e8400-e29b-41d4-a716-446655440001", title: "Example album", type: "Album", year: 2020 }],
            sourceFailed: false, readOnly: true,
        });
    });

    it("signals a provider failure rather than making up albums", async () => {
        spotlight.mockRejectedValueOnce(new Error("provider offline"));
        const res = await request(app).get(route + "?artistMbid=" + artistMbid)
            .set("x-test-user", "alice").expect(503);
        expect(res.body.error).toMatch(/unavailable/);
    });
});
