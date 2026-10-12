import type { Metadata } from "next";
import { getServerBranding } from "@/lib/branding-server";

export async function generateMetadata(): Promise<Metadata> {
    const branding = await getServerBranding();
    const title = "Shared Music - " + branding.name;
    const description = "Listen to shared music on " + branding.name + ". " + branding.tagline;
    return {
        title,
        description,
        openGraph: {
            title,
            description,
            siteName: branding.name,
            type: "music.song",
        },
    };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
    return children;
}
