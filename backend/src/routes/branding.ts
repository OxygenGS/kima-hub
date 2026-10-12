/**
 * Installation-wide white-label appearance.
 *
 * Public reads are deliberately unauthenticated so the login screen, browser
 * metadata and PWA manifest can display the instance's own name and icon.
 * Only an authenticated admin may update/reset the settings.
 *
 * Uploaded images are raster-only, size-bounded and re-encoded by sharp.
 * No SVG, remote image URL, HTML or executable content is persisted.
 */
import { Router } from "express";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const DEFAULTS = {
    name: "Kima",
    tagline: "Your music, your way",
    accentColor: "#fca200",
    backgroundColor: "#0a0a0a",
} as const;

const imageInput = z.string().max(650_000).nullable().optional();
const updateSchema = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    tagline: z.string().trim().max(120).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo: imageInput,
    favicon: imageInput,
}).strict().refine((v) => Object.keys(v).length > 0, "No changes supplied");

type ImageField = "logo" | "favicon";
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

async function normalizeImage(dataUrl: string, field: ImageField): Promise<Buffer> {
    const match = IMAGE_RE.exec(dataUrl);
    if (!match) throw new Error("Only PNG, JPEG or WebP images are supported");
    const input = Buffer.from(match[2], "base64");
    const limit = field === "logo" ? 400 * 1024 : 128 * 1024;
    if (!input.length || input.length > limit) {
        throw new Error(`${field} must be smaller than ${limit / 1024} KiB`);
    }
    // Re-encode to remove metadata and prevent SVG/HTML/polyglot file serving.
    const pipeline = sharp(input, { limitInputPixels: 4_000_000, failOn: "error" })
        .rotate()
        .resize(field === "logo" ? 512 : 192, field === "logo" ? 512 : 192, {
            fit: "inside",
            withoutEnlargement: field === "logo",
        });
    return field === "logo"
        ? pipeline.webp({ quality: 82 }).toBuffer()
        : pipeline.png().toBuffer();
}

async function publicConfig() {
    const settings = await prisma.brandingSettings.findUnique({
        where: { id: "default" },
        select: {
            name: true,
            tagline: true,
            accentColor: true,
            backgroundColor: true,
            logoContentType: true,
            faviconContentType: true,
            updatedAt: true,
        },
    });
    const version = settings?.updatedAt?.getTime() ?? 0;
    return {
        name: settings?.name ?? DEFAULTS.name,
        tagline: settings?.tagline ?? DEFAULTS.tagline,
        accentColor: settings?.accentColor ?? DEFAULTS.accentColor,
        backgroundColor: settings?.backgroundColor ?? DEFAULTS.backgroundColor,
        logoUrl: settings?.logoContentType
            ? `/api/branding/logo?v=${version}`
            : "/assets/images/kima.webp",
        faviconUrl: settings?.faviconContentType
            ? `/api/branding/favicon?v=${version}`
            : "/favicon.ico",
        hasCustomLogo: Boolean(settings?.logoContentType),
        hasCustomFavicon: Boolean(settings?.faviconContentType),
    };
}

// GET /api/branding -- also used before login, during SSR and by the PWA.
router.get("/", async (_req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        return res.json(await publicConfig());
    } catch (error) {
        logger.error("Branding read failed:", error);
        return res.status(500).json({ error: "Failed to load branding" });
    }
});

// GET /api/branding/:image -- images require no auth so browsers can load favicons.
router.get("/:image(logo|favicon)", async (req, res) => {
    try {
        const image = req.params.image as ImageField;
        const settings = await prisma.brandingSettings.findUnique({
            where: { id: "default" },
            select: image === "logo"
                ? { logoData: true, logoContentType: true }
                : { faviconData: true, faviconContentType: true },
        });
        const data = image === "logo"
            ? (settings as { logoData?: Uint8Array | null } | null)?.logoData
            : (settings as { faviconData?: Uint8Array | null } | null)?.faviconData;
        if (!data) return res.status(404).end();
        res.setHeader("Content-Type", image === "logo" ? "image/webp" : "image/png");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(Buffer.from(data));
    } catch (error) {
        logger.error("Branding image read failed:", error);
        return res.status(500).end();
    }
});

// POST /api/branding -- admin only. Omitted images stay unchanged; null clears.
router.post("/", requireAuth, requireAdmin, async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid branding settings" });
    try {
        const { logo, favicon, ...appearance } = parsed.data;
        const data: Record<string, unknown> = { ...appearance };
        if (logo !== undefined) {
            data.logoData = logo === null ? null : await normalizeImage(logo, "logo");
            data.logoContentType = logo === null ? null : "image/webp";
        }
        if (favicon !== undefined) {
            data.faviconData = favicon === null ? null : await normalizeImage(favicon, "favicon");
            data.faviconContentType = favicon === null ? null : "image/png";
        }
        await prisma.brandingSettings.upsert({
            where: { id: "default" },
            create: { id: "default", ...data },
            update: data,
        });
        res.setHeader("Cache-Control", "no-store");
        return res.json(await publicConfig());
    } catch (error) {
        if (error instanceof Error && /image|input|unsupported|png|jpeg|webp|size|pixels|corrupt|extract/i.test(error.message)) {
            return res.status(400).json({ error: "Invalid image; use a small PNG, JPEG or WebP file" });
        }
        logger.error("Branding update failed:", error);
        return res.status(500).json({ error: "Failed to save branding" });
    }
});

// DELETE /api/branding -- reset to the original neutral defaults.
router.delete("/", requireAuth, requireAdmin, async (_req, res) => {
    try {
        await prisma.brandingSettings.deleteMany({ where: { id: "default" } });
        res.setHeader("Cache-Control", "no-store");
        return res.json(await publicConfig());
    } catch (error) {
        logger.error("Branding reset failed:", error);
        return res.status(500).json({ error: "Failed to reset branding" });
    }
});

export default router;
