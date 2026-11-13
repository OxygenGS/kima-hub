/**
 * OxygenGS keeps symlink targets within /music so the playback and deletion
 * containment guards agree with the scanner. Exercise the real filesystem
 * traversal without changing test databases or importing any media.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { MusicScannerService } from "../musicScanner";

let workspace: string;
let music: string;

const listAudio = () => (
    new MusicScannerService() as unknown as {
        findAudioFiles: (dirPath: string, recordedPaths: string[]) => Promise<string[]>;
    }
).findAudioFiles(music, []);

beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "oxygengs-symlink-scan-"));
    music = path.join(workspace, "music");
    fs.mkdirSync(music);
});

afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
});

it("deduplicates a song reached by an in-library folder symlink", async () => {
    const albumDir = path.join(music, "Album");
    fs.mkdirSync(albumDir);
    const song = path.join(albumDir, "song.flac");
    fs.writeFileSync(song, "audio");
    fs.symlinkSync(albumDir, path.join(music, "Alias"));

    expect(await listAudio()).toEqual([song]);
});

it("skips linked songs and folders that escape the music root", async () => {
    const external = path.join(workspace, "external");
    fs.mkdirSync(external);
    const privateSong = path.join(external, "outside.flac");
    fs.writeFileSync(privateSong, "not-library-music");
    fs.symlinkSync(privateSong, path.join(music, "outside.flac"));
    fs.symlinkSync(external, path.join(music, "ExternalFolder"));

    const local = path.join(music, "local.flac");
    fs.writeFileSync(local, "audio");
    expect(await listAudio()).toEqual([local]);
});

it("skips broken links and loops without hanging or aborting the scan", async () => {
    fs.symlinkSync(path.join(workspace, "missing.flac"), path.join(music, "broken.flac"));
    const album = path.join(music, "Album");
    fs.mkdirSync(album);
    fs.symlinkSync(music, path.join(album, "back"));
    const song = path.join(album, "song.mp3");
    fs.writeFileSync(song, "audio");

    expect(await listAudio()).toEqual([song]);
});
