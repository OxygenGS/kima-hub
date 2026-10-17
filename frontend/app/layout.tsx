import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { BrandingProvider } from "@/lib/branding-context";
import { getServerBranding } from "@/lib/branding-server";
import { FeaturesProvider } from "@/lib/features-context";
import { DownloadProvider } from "@/lib/download-context";
import { ConditionalAudioProvider } from "@/components/providers/ConditionalAudioProvider";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { QueryProvider } from "@/lib/query-client";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { GlobalErrorBoundary } from "@/components/providers/GlobalErrorBoundary";
import { ActivityPanelSettingsProvider } from "@/lib/activity-panel-settings-context";

const montserrat = localFont({
    src: "../public/fonts/montserrat-latin.woff2",
    variable: "--font-montserrat",
    display: "swap",
    weight: "300 800",
});

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    themeColor: "#000000",
};

export async function generateMetadata(): Promise<Metadata> {
    const branding = await getServerBranding();
    return {
        title: branding.name + " - Your Music",
        description: branding.tagline,
        manifest: "/manifest.webmanifest",
        icons: {
            icon: [{
                url: branding.faviconUrl,
                type: branding.hasCustomFavicon ? "image/png" : "image/x-icon",
            }],
            apple: [{
                url: branding.hasCustomFavicon
                    ? branding.faviconUrl
                    : "/assets/images/apple-touch-icon.png",
                sizes: branding.hasCustomFavicon ? "192x192" : "180x180",
                type: "image/png",
            }],
        },
        appleWebApp: {
            capable: true,
            statusBarStyle: "black-translucent",
            title: branding.name,
        },
        openGraph: {
            title: branding.name,
            description: branding.tagline,
            siteName: branding.name,
            type: "website",
        },
    };
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${montserrat.variable} antialiased`}>
                <LanguageProvider>
                <GlobalErrorBoundary>
                    <BrandingProvider>
                    <ServiceWorkerRegistration />
                    <AuthProvider>
                        <FeaturesProvider>
                            <QueryProvider>
                                <DownloadProvider>
                                    <ConditionalAudioProvider>
                                        <ActivityPanelSettingsProvider>
                                            <AuthenticatedLayout>
                                                {children}
                                            </AuthenticatedLayout>
                                        </ActivityPanelSettingsProvider>
                                    </ConditionalAudioProvider>
                                </DownloadProvider>
                            </QueryProvider>
                        </FeaturesProvider>
                    </AuthProvider>
                    </BrandingProvider>
                </GlobalErrorBoundary>
                </LanguageProvider>
            </body>
        </html>
    );
}
