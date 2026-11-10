/**
 * File-backed, network-free contract test of the two Lidarr naming layouts.
 * The HTTP adapter emulates Lidarr's documented manual-import wire response.
 * No live Lidarr or Kima DB is involved; live dual-library E2E is a separate
 * release gate and MUST NOT be inferred from a passing contract test.
 */
import { createHash } from "crypto";
import { constants, promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import {
    lidarrStageFilePaths, verifyPinnedLidarrBytes,
    type LidarrMountMapping,
} from "../downtifyLidarrMounts";
import {
    previewVerifiedLidarrImport, submitVerifiedLidarrImport,
} from "../downtifyLidarrHandoff";
import { inspectLidarrFinalReceipt } from "../downtifyLidarrFinalReceipt";

const stageRelative =
    "Singles/Downtify/Tina Turner/Song - 0123456789ABCDEFGHIJKL.flac";
const expectedAudio = Buffer.alloc(1024, 42);
const sha256 = createHash("sha256").update(expectedAudio).digest("hex");
const receipt = {
    commandId: 101, artistId: 8, albumId: 10, trackId: 33,
    bytes: expectedAudio.length, sha256, durationMs: 242480,
};

describe("Downtify staged file -> Lidarr ManualImport -> immutable Kima file receipt", () => {
    let tempRoot: string;
    let roots: LidarrMountMapping;
    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(tmpdir(), "kima-lidarr-contract-"));
        const kimaDownloads = path.join(tempRoot, "downloads");
        const kimaMusic = path.join(tempRoot, "music");
        await fs.mkdir(kimaDownloads);
        await fs.mkdir(kimaMusic);
        roots = {
            kimaDownloads, lidarrDownloads: "/lidarr-downloads",
            kimaMusic, lidarrMusic: "/lidarr-music",
        };
    });
    afterEach(async () => {
        await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it.each([
        ["artist-only folder", "Tina Turner/02 - Song.flac"],
        ["artist and album folders", "Tina Turner/Private Dancer/02 - Song.flac"],
    ])("accepts %s only after an exact remote TrackFile and byte receipt", async (_layout, finalRelative) => {
        const stage = lidarrStageFilePaths(roots, stageRelative);
        expect(stage).not.toBeNull();
        if (!stage) throw new Error("Invalid test mount mapping");
        await fs.mkdir(path.dirname(stage.local), { recursive: true });
        await fs.writeFile(stage.local, expectedAudio);
        expect(await verifyPinnedLidarrBytes(
            stage.local, roots.kimaDownloads, expectedAudio.length, sha256,
        )).toBe(true);

        const expected = {
            path: stage.lidarr, bytes: expectedAudio.length,
            artist: "Tina Turner", album: "Private Dancer",
            title: "Song", durationMs: 242480,
        };
        const candidate = {
            path: stage.lidarr, size: expectedAudio.length,
            artist: { id: 8, artistName: "Tina Turner" },
            album: { id: 10, artistId: 8, title: "Private Dancer" },
            albumReleaseId: 12,
            tracks: [{ id: 33, artistId: 8, albumId: 10, title: "Song", duration: 242480 }],
            quality: { quality: { id: 7, name: "FLAC" } },
            rejections: [], additionalFile: false, replaceExistingFiles: false,
        };
        let commandSubmitted = false;
        const lidarrFinal = roots.lidarrMusic + "/" + finalRelative;
        const localFinal = path.join(roots.kimaMusic, finalRelative);
        const get = jest.fn(async (endpoint: string) => {
            if (endpoint === "/api/v1/manualimport") return { data: [candidate] };
            if (endpoint === "/api/v1/command/101") return { data: {
                id: 101, name: "ManualImport",
                status: commandSubmitted ? "completed" : "started",
                result: commandSubmitted ? "successful" : "unknown",
            } };
            if (endpoint === "/api/v1/track") return { data: [{
                id: 33, artistId: 8, albumId: 10, trackFileId: 44,
                hasFile: commandSubmitted, duration: 242480,
            }] };
            if (endpoint === "/api/v1/trackfile") return { data: commandSubmitted
                ? [{ id: 44, artistId: 8, albumId: 10,
                    size: expectedAudio.length, path: lidarrFinal }]
                : [] };
            throw Error("Unexpected remote API endpoint");
        });
        const post = jest.fn(async (endpoint: string, payload: unknown) => {
            expect(endpoint).toBe("/api/v1/command");
            expect(payload).toMatchObject({
                name: "ManualImport",
                importMode: "copy",
                replaceExistingFiles: false,
                files: [{ path: stage.lidarr, artistId: 8, albumId: 10,
                    albumReleaseId: 12, trackIds: [33],
                    disableReleaseSwitching: false }],
            });
            // Emulate Lidarr choosing the final path; Kima never writes it.
            await fs.mkdir(path.dirname(localFinal), { recursive: true });
            await fs.copyFile(stage.local, localFinal, constants.COPYFILE_EXCL);
            commandSubmitted = true;
            return { data: { id: 101 } };
        });

        // Neither queued nor completed import commands are inferred from
        // preview; the source must remain intact through Copy mode.
        const preview = await previewVerifiedLidarrImport({ get } as never, expected);
        expect(preview.state).toBe("matched");
        if (preview.state !== "matched") throw Error("Invalid test candidate");
        expect(await submitVerifiedLidarrImport({ post } as never, preview.match))
            .toEqual({ state: "accepted", commandId: 101 });
        expect(post).toHaveBeenCalledTimes(1);

        expect(await inspectLidarrFinalReceipt({ get } as never, roots, receipt))
            .toEqual({ state: "verified", lidarrTrackFileId: 44,
                relativePath: finalRelative });
        expect(await fs.readFile(stage.local)).toEqual(expectedAudio);
        expect(await fs.readFile(localFinal)).toEqual(expectedAudio);
    });
});
