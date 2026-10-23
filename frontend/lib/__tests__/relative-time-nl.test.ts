import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "../relative-time";
import { translate } from "../i18n/translations";

describe("activity locale presentation", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("keeps the existing English time format", () => {
        expect(timeAgo("2026-10-23T11:59:30Z")).toBe("Just now");
        expect(timeAgo("2026-10-23T11:48:00Z")).toBe("12m ago");
        expect(timeAgo("2026-10-23T09:00:00Z")).toBe("3h ago");
    });

    it("shows Dutch activity timestamps without altering source dates", () => {
        expect(timeAgo("2026-10-23T11:59:30Z", "nl")).toBe("Zojuist");
        expect(timeAgo("2026-10-23T11:48:00Z", "nl")).toBe("12 min geleden");
        expect(timeAgo("2026-10-23T09:00:00Z", "nl")).toBe("3 uur geleden");
        expect(timeAgo("2026-10-20T12:00:00Z", "nl"))
            .toBe(new Date("2026-10-20T12:00:00Z").toLocaleDateString("nl-NL"));
    });

    it("localizes activity controls while leaving music titles intact", () => {
        expect(translate("nl", "ITEMS")).toBe("MELDINGEN");
        expect(translate("nl", "CLEAR")).toBe("WISSEN");
        expect(translate("nl", "VIEW")).toBe("BEKIJKEN");
        expect(translate("nl", "ACTIVE")).toBe("ACTIEF");
        expect(translate("nl", "User-supplied playlist title")).toBe("User-supplied playlist title");
    });
});
