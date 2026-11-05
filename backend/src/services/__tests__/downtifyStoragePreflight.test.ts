import { inspectDowntifyStorage } from "../downtifyStoragePreflight";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));

const settings = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "true",
    KIMA_DOWNTIFY_STAGING_ROOT: "/staging/downloads",
    ...overrides,
});

function reader(sourceDev = 7, libraryDev = 12) {
    const lstat = jest.fn(async (p: string) => ({
        dev: p === "/music" ? libraryDev : sourceDev,
        isDirectory: () => true,
        isSymbolicLink: (): boolean => false,
    }));
    const realpath = jest.fn(async (p: string) => p);
    return { lstat, realpath };
}

describe("D4 operator-only read-only storage topology", () => {
    it("never accesses the filesystem when off or missing operator settings", async () => {
        const io = reader();
        const disabled = await inspectDowntifyStorage(settings({
            KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "false",
        }), "/music", io);
        expect(disabled).toMatchObject({
            state: "disabled", filesystemRelation: "not_checked",
            filesChanged: false, importerCutoverAuthorized: false,
        });
        expect((await inspectDowntifyStorage(settings({
            KIMA_DOWNTIFY_ENABLED: "false",
        }), "/music", io)).state).toBe("disabled");
        expect((await inspectDowntifyStorage(settings({
            KIMA_DOWNTIFY_STAGING_ROOT: "",
        }), "/music", io)).state).toBe("misconfigured");
        expect(io.lstat).not.toHaveBeenCalled();
    });

    it.each([
        "/", "../staging", "relative/downloads", "/music/../staging",
        "/staging/./downloads", "/staging\\downloads", "/staging/\u0000/private",
    ])("rejects unsafe staging root %p without accessing files", async (root) => {
        const io = reader();
        expect((await inspectDowntifyStorage(
            settings({ KIMA_DOWNTIFY_STAGING_ROOT: root }), "/music", io
        )).state).toBe("misconfigured");
        expect(io.lstat).not.toHaveBeenCalled();
    });

    it("reports separate filesystems as requiring a future copy operation", async () => {
        const io = reader(100, 200);
        const value = await inspectDowntifyStorage(settings(), "/music", io);
        expect(value).toEqual({
            state: "inspected", filesystemRelation: "different_device",
            copyRequiredByDevice: true, mountIdentityVerified: false,
            sourceAudioVerified: false, libraryImportVerified: false,
            importerCutoverAuthorized: false, filesChanged: false,
        });
        expect(io.lstat).toHaveBeenCalledWith("/staging/downloads");
        expect(io.lstat).toHaveBeenCalledWith("/music");
        expect(JSON.stringify(value)).not.toContain("/staging");
        expect(JSON.stringify(value)).not.toContain("/music");
        expect(JSON.stringify(value)).not.toContain("100");
    });

    it("reports same device only as a candidate, never as a guaranteed hardlink", async () => {
        const value = await inspectDowntifyStorage(settings(), "/music", reader(33, 33));
        expect(value).toMatchObject({
            state: "inspected", filesystemRelation: "same_device_candidate",
            copyRequiredByDevice: false,
            mountIdentityVerified: false, importerCutoverAuthorized: false,
        });
    });

    it("rejects nested, overlapping, or identical source and library roots", async () => {
        const io = reader();
        expect((await inspectDowntifyStorage(settings(), "/staging/downloads", io)).state)
            .toBe("unsafe_layout");
        expect((await inspectDowntifyStorage(settings(), "/staging/downloads/music", io)).state)
            .toBe("unsafe_layout");
        expect((await inspectDowntifyStorage(
            settings({ KIMA_DOWNTIFY_STAGING_ROOT: "/music/subdir" }), "/music", io
        )).state).toBe("unsafe_layout");
    });

    it("rejects symlinks and symlinked ancestors instead of claiming safe mounts", async () => {
        const symlink = reader();
        symlink.lstat.mockImplementation(async p => ({
            dev: 3, isDirectory: () => true,
            isSymbolicLink: () => p === "/staging/downloads",
        }));
        expect((await inspectDowntifyStorage(settings(), "/music", symlink)).state)
            .toBe("unsafe_layout");

        const ancestor = reader();
        ancestor.realpath.mockResolvedValueOnce("/unexpected/link-target");
        expect((await inspectDowntifyStorage(settings(), "/music", ancestor)).state)
            .toBe("unsafe_layout");
    });

    it("does not mistake missing DAS or download mounts for a usable library", async () => {
        const sourceMissing = reader();
        sourceMissing.lstat.mockRejectedValueOnce(new Error("private /staging downloads missing"));
        expect((await inspectDowntifyStorage(settings(), "/music", sourceMissing)).state)
            .toBe("source_unavailable");
        const libraryMissing = reader();
        libraryMissing.lstat.mockImplementationOnce(async () => ({
            dev: 4, isDirectory: () => true, isSymbolicLink: () => false,
        }));
        libraryMissing.lstat.mockRejectedValueOnce(new Error("DAS mount absent"));
        const value = await inspectDowntifyStorage(settings(), "/music", libraryMissing);
        expect(value).toMatchObject({ state: "library_unavailable", filesChanged: false });
        expect(JSON.stringify(value)).not.toContain("DAS mount");
    });

    it("never marks a storage check as proof of an indexed or playable audio file", async () => {
        for (const dev of [3, 14]) {
            const value = await inspectDowntifyStorage(settings(), "/music", reader(3, dev));
            expect(value.libraryImportVerified).toBe(false);
            expect(value.sourceAudioVerified).toBe(false);
            expect(value.mountIdentityVerified).toBe(false);
            expect(value.importerCutoverAuthorized).toBe(false);
            expect(value.filesChanged).toBe(false);
        }
    });
});
