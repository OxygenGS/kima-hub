/**
 * Kima Connect device identity belongs to one authenticated browser tab and user.
 * It is a locator, NOT a bearer token; the API always checks account ownership.
 * getRandomValues also works on HTTP LAN installations where randomUUID may not.
 */
const ID_PREFIX = "kima-connect-tab:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function freshId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/** May return null when the browser blocks secure random numbers. Never invent an ID on the server. */
export function getConnectDeviceId(userId: string): string | null {
    if (typeof window === "undefined" || !userId) return null;
    try {
        const key = ID_PREFIX + userId;
        const saved = sessionStorage.getItem(key);
        if (saved && UUID.test(saved)) return saved;
        const id = freshId();
        sessionStorage.setItem(key, id);
        return id;
    } catch {
        // Refuse to register rather than silently share an unsafe device identity.
        return null;
    }
}

export function getConnectDeviceName(): string {
    if (typeof navigator === "undefined") return "Kima player";
    const agent = navigator.userAgent;
    if (/TV|Tizen|Web0S|SmartTV|HbbTV/i.test(agent)) return "Kima TV";
    if (/iPad|Tablet/i.test(agent)) return "Kima tablet";
    if (/Mobile|Android|iPhone/i.test(agent)) return "Kima mobile";
    return "Kima desktop";
}
