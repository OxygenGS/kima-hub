/** Read-only Redis AOF recovery behavior: never mutate user data. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.resolve(__dirname, "../../redis-aof-diagnostics.sh");
let scratch: string;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kima-redis-aof-"));
});
afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

function fakeVerifier(code: number): string {
    const bin = path.join(scratch, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "redis-check-aof"),
        "#!/bin/sh\nexit " + code + "\n", { mode: 0o755 });
    return bin;
}
function check(extraPath?: string) {
    const env = {
        ...process.env,
        REDIS_DATA_DIR: path.join(scratch, "redis"),
        PATH: extraPath ? extraPath + path.delimiter + process.env.PATH : process.env.PATH,
    };
    return spawnSync("sh", [SCRIPT], { env, encoding: "utf8", timeout: 5000 });
}
function createManifest(): string {
    const dir = path.join(scratch, "redis", "appendonlydir");
    fs.mkdirSync(dir, { recursive: true });
    const manifest = path.join(dir, "appendonly.aof.manifest");
    fs.writeFileSync(manifest, "original-manifest-bytes");
    return manifest;
}

describe("AIO Redis AOF diagnostics", () => {
    it("does not label an absent mount as corruption", () => {
        const r = check();
        expect(r.status).toBe(3);
        expect(r.stdout).toContain("absent or not mounted");
    });

    it("checks a multi-part manifest without altering it", () => {
        const manifest = createManifest();
        const bytes = fs.readFileSync(manifest);
        const r = check(fakeVerifier(0));
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("passed the read-only check");
        expect(fs.readFileSync(manifest)).toEqual(bytes);
    });

    it("flags an invalid AOF and leaves all its bytes untouched", () => {
        const manifest = createManifest();
        const bytes = fs.readFileSync(manifest);
        const r = check(fakeVerifier(1));
        expect(r.status).toBe(2);
        expect(r.stdout).toContain("POSSIBLE Redis AOF corruption");
        expect(r.stdout).toContain("no data was modified");
        expect(fs.readFileSync(manifest)).toEqual(bytes);
    });

    it("does not claim an empty directory is corrupt", () => {
        fs.mkdirSync(path.join(scratch, "redis"));
        const r = check(fakeVerifier(0));
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("No AOF manifest or legacy AOF");
    });

    it("has no destructive repair invocation", () => {
        const source = fs.readFileSync(SCRIPT, "utf8");
        expect(source).toContain('redis-check-aof "$target"');
        expect(source).not.toMatch(/redis-check-aof\s+(--fix|-f)|rm\s+-rf|FLUSHALL/);
    });
});
