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

it("skips unreadable real subfolders while continuing other files and reporting the blocked subtree", async () => {
    const blocked = path.join(music, "singles", "downtify");
    fs.mkdirSync(blocked, { recursive: true });
    fs.writeFileSync(path.join(blocked, "old.flac"), "old");
    const newSong = path.join(music, "new-song.flac");
    fs.writeFileSync(newSong, "new");

    const original = fs.promises.readdir.bind(fs.promises);
    const spy = jest.spyOn(fs.promises, "readdir").mockImplementation((async (...args: any[]) => {
        if (String(args[0]) === blocked) {
            throw Object.assign(new Error("EACCES: permission denied, scandir"), { code: "EACCES" });
        }
        return (original as any)(...args);
    }) as any);
    try {
        const skipped: string[] = [];
        const files = await (new MusicScannerService() as any).findAudioFiles(
            music, [], (dir: string, error: NodeJS.ErrnoException) => {
                expect(error.code).toBe("EACCES");
                skipped.push(dir);
            },
        );
        expect(files).toEqual([newSong]);
        expect(skipped).toEqual([blocked]);
    } finally {
        spy.mockRestore();
    }
});

it("keeps unreadable library roots and unexpected disk errors fatal", async () => {
    const child = path.join(music, "Album");
    fs.mkdirSync(child);
    const original = fs.promises.readdir.bind(fs.promises);
    const spy = jest.spyOn(fs.promises, "readdir").mockImplementation((async (...args: any[]) => {
        const directory = String(args[0]);
        if (directory === music || directory === child) {
            throw Object.assign(
                new Error("Cannot read directory"),
                { code: directory === music ? "EACCES" : "EIO" },
            );
        }
        return (original as any)(...args);
    }) as any);
    try {
        const skipped: string[] = [];
        await expect(
            (new MusicScannerService() as any).findAudioFiles(
                music, [], (dir: string) => skipped.push(dir),
            )
        ).rejects.toThrow("Cannot read directory");
        expect(skipped).toEqual([]);

        // The root is now available, but an I/O error in a child still fails closed.
        spy.mockImplementation((async (...args: any[]) => {
            if (String(args[0]) === child) {
                throw Object.assign(new Error("I/O error"), { code: "EIO" });
            }
            return (original as any)(...args);
        }) as any);
        await expect(
            (new MusicScannerService() as any).findAudioFiles(
                music, [], (dir: string) => skipped.push(dir),
            )
        ).rejects.toThrow("I/O error");
        expect(skipped).toEqual([]);
    } finally {
        spy.mockRestore();
    }
});
