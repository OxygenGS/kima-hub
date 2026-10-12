import { NextResponse } from "next/server";
import { getServerBranding } from "@/lib/branding-server";

// Installed/PWA clients receive instance-specific branding, not a built-in logo.
export const dynamic = "force-dynamic";

export async function GET() {
    const branding = await getServerBranding();
    const icons = branding.hasCustomFavicon
        ? [
            // Uploaded favicons are normalized to a true 192x192 PNG.
            { src: branding.faviconUrl, type: "image/png", sizes: "192x192", purpose: "any" },
        ]
        : [
            { src: "/assets/icons/icon-48.webp", type: "image/webp", sizes: "48x48", purpose: "any" },
            { src: "/assets/icons/icon-72.webp", type: "image/webp", sizes: "72x72", purpose: "any" },
            { src: "/assets/icons/icon-96.webp", type: "image/webp", sizes: "96x96", purpose: "any" },
            { src: "/assets/icons/icon-128.webp", type: "image/webp", sizes: "128x128", purpose: "any" },
            { src: "/assets/icons/icon-192.webp", type: "image/webp", sizes: "192x192", purpose: "any maskable" },
            { src: "/assets/icons/icon-256.webp", type: "image/webp", sizes: "256x256", purpose: "any" },
            { src: "/assets/icons/icon-512.webp", type: "image/webp", sizes: "512x512", purpose: "any maskable" },
        ];

    const shortcutIcon = branding.hasCustomFavicon
        ? branding.faviconUrl
        : "/assets/icons/icon-96.webp";

    return NextResponse.json({
        id: "/",
        name: branding.name,
        short_name: branding.name.slice(0, 25),
        description: branding.tagline,
        lang: "en",
        scope: "/",
        start_url: "/",
        orientation: "portrait",
        theme_color: branding.backgroundColor,
        background_color: branding.backgroundColor,
        categories: ["music", "entertainment"],
        icons,
        shortcuts: [
            { name: "Vibe", short_name: "Vibe", url: "/vibe", icons: [{ src: shortcutIcon, sizes: branding.hasCustomFavicon ? "192x192" : "96x96" }] },
            { name: "Search", short_name: "Search", url: "/search", icons: [{ src: shortcutIcon, sizes: branding.hasCustomFavicon ? "192x192" : "96x96" }] },
            { name: "Library", short_name: "Library", url: "/library", icons: [{ src: shortcutIcon, sizes: branding.hasCustomFavicon ? "192x192" : "96x96" }] },
        ],
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
    }, {
        headers: {
            "Content-Type": "application/manifest+json",
            "Cache-Control": "no-store",
        },
    });
}
