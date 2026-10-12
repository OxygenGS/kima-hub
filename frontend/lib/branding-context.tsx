"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export interface InstanceBranding {
    name: string;
    tagline: string;
    accentColor: string;
    backgroundColor: string;
    logoUrl: string;
    faviconUrl: string;
    hasCustomLogo: boolean;
    hasCustomFavicon: boolean;
}

export const DEFAULT_BRANDING: InstanceBranding = {
    name: "Kima",
    tagline: "Your music, your way",
    accentColor: "#fca200",
    backgroundColor: "#0a0a0a",
    logoUrl: "/assets/images/kima.webp",
    faviconUrl: "/favicon.ico",
    hasCustomLogo: false,
    hasCustomFavicon: false,
};

interface BrandingContextValue {
    branding: InstanceBranding;
    refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

function mixHex(base: string, target: string, ratio: number): string {
    const blend = [1, 3, 5].map((pos) => {
        const a = parseInt(base.slice(pos, pos + 2), 16);
        const b = parseInt(target.slice(pos, pos + 2), 16);
        return Math.round(a * (1 - ratio) + b * ratio).toString(16).padStart(2, "0");
    });
    return "#" + blend.join("");
}

function applyTheme(branding: InstanceBranding) {
    const root = document.documentElement;
    const accent = branding.accentColor;
    const background = branding.backgroundColor;

    root.style.setProperty("--color-brand", accent);
    root.style.setProperty("--color-brand-hover", mixHex(accent, "#000000", 0.10));
    root.style.setProperty("--color-brand-light", mixHex(accent, "#ffffff", 0.20));
    root.style.setProperty("--color-brand-dark", mixHex(accent, "#000000", 0.18));

    root.style.setProperty("--bg-primary", background);
    root.style.setProperty("--bg-secondary", mixHex(background, "#ffffff", 0.025));
    root.style.setProperty("--bg-tertiary", mixHex(background, "#ffffff", 0.05));
    root.style.setProperty("--bg-hover", mixHex(background, "#ffffff", 0.08));
    root.style.setProperty("--bg-active", mixHex(background, "#ffffff", 0.10));
}

export function BrandingProvider({ children }: { children: ReactNode }) {
    const [branding, setBranding] = useState<InstanceBranding>(DEFAULT_BRANDING);

    const refreshBranding = useCallback(async () => {
        const response = await fetch("/api/branding", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load instance branding");
        const config = await response.json() as InstanceBranding;
        setBranding(config);
    }, []);

    useEffect(() => {
        let mounted = true;
        // Resolve asynchronously inside the effect; avoid a synchronous state
        // transition while React is committing the initial render.
        void fetch("/api/branding", { cache: "no-store" })
            .then((response) => response.ok ? response.json() as Promise<InstanceBranding> : Promise.reject())
            .then((config) => { if (mounted) setBranding(config); })
            .catch(() => {});
        const onFocus = () => void refreshBranding().catch(() => {});
        window.addEventListener("focus", onFocus);
        return () => {
            mounted = false;
            window.removeEventListener("focus", onFocus);
        };
    }, [refreshBranding]);

    useEffect(() => {
        applyTheme(branding);
        document.title = branding.name + " - Your Music";

        // Browser favicons are served without auth; replacing the icon link also
        // works for an already-open tab after the administrator changes it.
        const previous = document.querySelector<HTMLLinkElement>('link[data-instance-branding="true"]');
        previous?.remove();
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = branding.faviconUrl;
        link.dataset.instanceBranding = "true";
        document.head.appendChild(link);
        return () => link.remove();
    }, [branding]);

    const value = useMemo(() => ({ branding, refreshBranding }), [branding, refreshBranding]);

    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
    const context = useContext(BrandingContext);
    if (!context) throw new Error("useBranding must be used within BrandingProvider");
    return context;
}
