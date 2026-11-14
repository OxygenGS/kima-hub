import { beforeEach, describe, expect, it } from "vitest";
import { getConnectDeviceId, getConnectDeviceName } from "../connect-device-id";

beforeEach(() => {
    sessionStorage.clear();
});

describe("browser Kima Connect identity", () => {
    it("provides a stable v4 UUID within one tab for one user", () => {
        const first = getConnectDeviceId("alice");
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(getConnectDeviceId("alice")).toBe(first);
    });

    it("never reuses an account's browser identity for a different signed-in user", () => {
        const alice = getConnectDeviceId("alice");
        const bob = getConnectDeviceId("bob");
        expect(bob).not.toBe(alice);
        expect(getConnectDeviceId("alice")).toBe(alice);
    });

    it("replaces a corrupt saved identifier", () => {
        sessionStorage.setItem("kima-connect-tab:alice", "../../other-device");
        const id = getConnectDeviceId("alice");
        expect(id).not.toBe("../../other-device");
        expect(sessionStorage.getItem("kima-connect-tab:alice")).toBe(id);
    });

    it("returns no identity outside a signed-in user", () => {
        expect(getConnectDeviceId("")).toBeNull();
        expect(getConnectDeviceName()).toMatch(/^Kima /);
    });
});
