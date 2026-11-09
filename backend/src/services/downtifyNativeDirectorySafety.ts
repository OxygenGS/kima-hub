/**
 * Shared trust policy for an existing Docker music library.
 *
 * A root-owned/root-group directory with mode 0775 is common for a NAS or
 * bind mount. Its group is the host's privileged root group, not the
 * unprivileged Kima backend. It is safe to traverse without giving Kima
 * write permission on the entire music collection.
 *
 * Never accept world-writable parents, group-writable directories belonging
 * to a non-root group, symlinks or non-directories. The dedicated importer
 * tree must still be pre-provisioned with restricted permissions when its
 * parent is not writable by Kima.
 */
export type NativeDirectoryInfo = {
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
    uid: number;
    gid: number;
};

export function trustedNativeMusicDirectory(info: NativeDirectoryInfo): boolean {
    if (!info.isDirectory() || info.isSymbolicLink()) return false;
    if ((info.mode & 0o002) !== 0) return false;
    // A privileged root:root group is the only acceptable writable group.
    if ((info.mode & 0o020) !== 0 && !(info.uid === 0 && info.gid === 0)) {
        return false;
    }
    return true;
}
