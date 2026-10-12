import type { InstanceBranding } from "./branding-context";

const DEFAULT: InstanceBranding = {
    name: "Kima",
    tagline: "Your music, your way",
    accentColor: "#fca200",
    backgroundColor: "#0a0a0a",
    logoUrl: "/assets/images/kima.webp",
    faviconUrl: "/favicon.ico",
    hasCustomLogo: false,
    hasCustomFavicon: false,
};

/** Used by server-rendered metadata and the PWA manifest. Never depends on auth. */
export async function getServerBranding(): Promise<InstanceBranding> {
    const backend = process.env.BACKEND_URL
        || process.env.NEXT_PUBLIC_BACKEND_URL
        || "http://127.0.0.1:3006";
    try {
        const response = await fetch(backend + "/api/branding", {
            cache: "no-store",
            signal: AbortSignal.timeout(1500),
        });
        if (!response.ok) return DEFAULT;
        return await response.json() as InstanceBranding;
    } catch {
        // Metadata should not break login/setup if the backend is restarting.
        return DEFAULT;
    }
}
