"use client";

import Image from "next/image";
import { BRAND_GRADIENT_CSS } from "@/lib/brandGradient";
import { useBranding } from "@/lib/branding-context";

/**
 * Use the installation logo when customized. Keep the animated waveform as
 * the neutral fallback when an administrator has not uploaded a logo.
 */
export function KimaMark({ size, className = "" }: { size: number; className?: string }) {
    const { branding } = useBranding();

    if (branding.hasCustomLogo) {
        return (
            <Image
                src={branding.logoUrl}
                alt={branding.name + " logo"}
                width={size}
                height={size}
                unoptimized
                className={`inline-block shrink-0 object-contain ${className}`}
                style={{ width: size, height: size }}
            />
        );
    }

    return (
        <span
            role="img"
            aria-label="Kima"
            className={`kima-mark inline-block shrink-0 ${className}`}
            style={{ width: size, height: size, background: BRAND_GRADIENT_CSS }}
        />
    );
}
