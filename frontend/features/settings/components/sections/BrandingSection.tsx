"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import {
    DEFAULT_BRANDING,
    brandingBackgroundTextContrast,
    useBranding,
    type InstanceBranding,
} from "@/lib/branding-context";
import { SettingsSection } from "../ui";

const LOGO_LIMIT = 400 * 1024;
const FAVICON_LIMIT = 128 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function fileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Could not read image"));
        };
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
    });
}

type Editable = Pick<InstanceBranding, "name" | "tagline" | "accentColor" | "backgroundColor">;

export function BrandingSection() {
    const { branding, refreshBranding } = useBranding();
    // Re-mount the form when the shared brand changes after a successful save.
    return <BrandingEditor key={JSON.stringify(branding)} initial={branding} onChanged={refreshBranding} />;
}

function BrandingEditor({
    initial,
    onChanged,
}: {
    initial: InstanceBranding;
    onChanged: () => Promise<void>;
}) {
    const [values, setValues] = useState<Editable>({
        name: initial.name,
        tagline: initial.tagline,
        accentColor: initial.accentColor,
        backgroundColor: initial.backgroundColor,
    });
    // undefined: keep existing; null: remove; data URL: replace.
    const [logoChange, setLogoChange] = useState<string | null | undefined>(undefined);
    const [faviconChange, setFaviconChange] = useState<string | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const update = (patch: Partial<Editable>) => setValues((previous) => ({ ...previous, ...patch }));

    const selectImage = async (
        event: ChangeEvent<HTMLInputElement>,
        type: "logo" | "favicon",
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setError(null);
        const limit = type === "logo" ? LOGO_LIMIT : FAVICON_LIMIT;
        if (!ALLOWED_TYPES.has(file.type) || file.size > limit || file.size === 0) {
            setError(`Use a PNG, JPEG or WebP smaller than ${Math.floor(limit / 1024)} KB.`);
            return;
        }
        try {
            const dataUrl = await fileAsDataUrl(file);
            if (type === "logo") setLogoChange(dataUrl);
            else setFaviconChange(dataUrl);
            setFeedback("Image selected. Save branding to apply.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not read image");
        }
    };

    const save = async () => {
        setError(null);
        setFeedback(null);
        if (!values.name.trim() || values.name.length > 60) {
            setError("Please enter a name of up to 60 characters.");
            return;
        }
        setBusy(true);
        try {
            await api.post("/branding", {
                ...values,
                ...(logoChange !== undefined ? { logo: logoChange } : {}),
                ...(faviconChange !== undefined ? { favicon: faviconChange } : {}),
            });
            await onChanged();
            setFeedback("Branding saved for this installation.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save branding");
        } finally {
            setBusy(false);
        }
    };

    const reset = async () => {
        if (!window.confirm("Reset the name, colors, logo and favicon to the original defaults?")) return;
        setError(null);
        setBusy(true);
        try {
            await api.delete("/branding");
            await onChanged();
            setFeedback("Branding reset to defaults.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not reset branding");
        } finally {
            setBusy(false);
        }
    };

    const logoUrl = logoChange === undefined
        ? initial.logoUrl
        : logoChange ?? DEFAULT_BRANDING.logoUrl;
    const faviconUrl = faviconChange === undefined
        ? initial.faviconUrl
        : faviconChange ?? DEFAULT_BRANDING.faviconUrl;
    const backgroundContrast = brandingBackgroundTextContrast(values.backgroundColor);
    const backgroundHasLowContrast = backgroundContrast < 4.5;

    return (
        <SettingsSection
            id="branding"
            title="Branding & Appearance"
            description="Personalize this installation for every listener. Changes survive Docker updates."
        >
            <div className="space-y-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex gap-4 items-center rounded-lg bg-black/30 p-4">
                    <Image src={logoUrl} alt="Logo preview" width={56} height={56} unoptimized className="h-14 w-14 object-contain" />
                    <div className="min-w-0">
                        <p className="text-lg font-bold text-white truncate">{values.name || "Your installation"}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{values.tagline}</p>
                        <span className="mt-2 inline-block h-1.5 w-20 rounded" style={{ backgroundColor: values.accentColor }} />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5 block">
                        <span className="text-xs text-[var(--text-secondary)]">Application name</span>
                        <input
                            value={values.name}
                            maxLength={60}
                            onChange={(event) => update({ name: event.target.value })}
                            placeholder="My Music"
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand focus:outline-none"
                        />
                    </label>
                    <label className="space-y-1.5 block">
                        <span className="text-xs text-[var(--text-secondary)]">Tagline</span>
                        <input
                            value={values.tagline}
                            maxLength={120}
                            onChange={(event) => update({ tagline: event.target.value })}
                            placeholder="Your music, your way"
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand focus:outline-none"
                        />
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex gap-3 items-center text-xs text-[var(--text-secondary)]">
                        <input
                            type="color"
                            value={values.accentColor}
                            onChange={(event) => update({ accentColor: event.target.value })}
                            className="h-11 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                        />
                        <span><strong className="block text-white">Accent color</strong>{values.accentColor}</span>
                    </label>
                    <label className="flex gap-3 items-center text-xs text-[var(--text-secondary)]">
                        <input
                            type="color"
                            value={values.backgroundColor}
                            onChange={(event) => update({ backgroundColor: event.target.value })}
                            className="h-11 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                        />
                        <span><strong className="block text-white">Main background</strong>{values.backgroundColor}</span>
                    </label>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                    This interface uses light text: choose a dark background for readable contrast.
                    The accent color changes primary buttons and themed highlights.
                </p>
                {backgroundHasLowContrast && (
                    <p role="status" className="text-xs text-amber-300">
                        Low contrast: primary text is only {backgroundContrast.toFixed(1)}:1 against this background.
                        Choose a darker background for at least 4.5:1 readability.
                    </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/10 p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Logo</p>
                        <Image src={logoUrl} alt="Selected logo" width={64} height={64} unoptimized className="h-16 w-16 object-contain" />
                        <p className="text-xs text-[var(--text-muted)]">PNG, JPEG or WebP; max. 400 KB. Square images work best.</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="cursor-pointer text-xs text-brand hover:underline focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
                                Choose logo
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void selectImage(event, "logo")} />
                            </label>
                            {(initial.hasCustomLogo || typeof logoChange === "string") && (
                                <button type="button" className="text-xs text-[var(--text-muted)] hover:text-white" onClick={() => setLogoChange(null)}>Remove</button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 p-3 space-y-3">
                        <p className="text-sm font-semibold text-white">Favicon / app icon</p>
                        <Image src={faviconUrl} alt="Selected favicon" width={64} height={64} unoptimized className="h-16 w-16 object-contain" />
                        <p className="text-xs text-[var(--text-muted)]">PNG, JPEG or WebP; max. 128 KB. Square images work best.</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="cursor-pointer text-xs text-brand hover:underline focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
                                Choose favicon
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void selectImage(event, "favicon")} />
                            </label>
                            {(initial.hasCustomFavicon || typeof faviconChange === "string") && (
                                <button type="button" className="text-xs text-[var(--text-muted)] hover:text-white" onClick={() => setFaviconChange(null)}>Remove</button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save()}
                        className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-brand-contrast disabled:opacity-50"
                    >
                        {busy ? "Saving..." : "Save branding"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-lg border border-white/20 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-white disabled:opacity-50">
                        Reset to defaults
                    </button>
                </div>
                {feedback && <p role="status" className="text-xs text-emerald-400">{feedback}</p>}
                {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
            </div>
        </SettingsSection>
    );
}
