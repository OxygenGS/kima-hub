import { trustedNativeMusicDirectory } from "../downtifyNativeDirectorySafety";

function directory(uid: number, gid: number, mode: number) {
    return {
        uid, gid, mode,
        isDirectory: () => true, isSymbolicLink: () => false,
    };
}
const backend = { uid: 998, groups: [998, 996] };

describe("Downtify mount parent permissions without broad library write access", () => {
    it("accepts a real-world root:root 0775 NAS root when Kima has no root group", () => {
        expect(trustedNativeMusicDirectory(directory(0, 0, 0o775), backend)).toBe(true);
    });
    it("accepts root-owned read-only ancestors and a private importer leaf", () => {
        expect(trustedNativeMusicDirectory(directory(0, 0, 0o755), backend)).toBe(true);
        expect(trustedNativeMusicDirectory(directory(998, 998, 0o750), backend)).toBe(true);
    });
    it("refuses a world-writable music root", () => {
        expect(trustedNativeMusicDirectory(directory(0, 0, 0o777), backend)).toBe(false);
    });
    it("refuses a writeable group where Kima or another user could replace paths", () => {
        expect(trustedNativeMusicDirectory(directory(998, 998, 0o775), backend)).toBe(false);
        expect(trustedNativeMusicDirectory(directory(0, 996, 0o775), backend)).toBe(false);
        expect(trustedNativeMusicDirectory(directory(0, 0, 0o775),
            { uid: 998, groups: [0, 998] })).toBe(false);
        expect(trustedNativeMusicDirectory(directory(0, 0, 0o775),
            { uid: 0, groups: [0] })).toBe(false);
    });
    it("refuses a symlink and any non-directory regardless of ownership", () => {
        expect(trustedNativeMusicDirectory({
            ...directory(0, 0, 0o755), isSymbolicLink: () => true,
        }, backend)).toBe(false);
        expect(trustedNativeMusicDirectory({
            ...directory(0, 0, 0o755), isDirectory: () => false,
        }, backend)).toBe(false);
    });
});
