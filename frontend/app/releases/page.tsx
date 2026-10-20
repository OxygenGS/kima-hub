"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Calendar, Clock, Download, Disc, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { api } from "@/lib/api";
import { useMusicPermissions } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { notify } from "@/lib/notify";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { MediaCard } from "@/components/cards/MediaCard";
import { PageMessage } from "@/components/ui/PageMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClass } from "@/components/ui/Button";

interface ReleaseItem {
    id: number | string;
    title: string;
    artistName: string;
    artistMbid?: string;
    albumMbid: string;
    releaseDate: string;
    coverUrl: string | null;
    source: 'lidarr' | 'similar';
    status: 'upcoming' | 'released' | 'available';
    inLibrary: boolean;
    canDownload: boolean;
}

interface ReleaseRadarData {
    upcoming: ReleaseItem[];
    recent: ReleaseItem[];
    monitoredArtistCount: number;
    similarArtistCount: number;
}

export default function ReleasesPage() {
    const { canRequestAlbums } = useMusicPermissions();
    const { locale, t } = useLanguage();
    const [data, setData] = useState<ReleaseRadarData | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState<string | number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchReleases = async () => {
        try {
            setLoading(true);
            const json = await api.get<ReleaseRadarData>("/releases/radar?daysBack=30&daysAhead=90");
            setData(json);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to fetch releases");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReleases();
    }, []);

    const handleDownload = async (albumMbid: string, releaseId: string | number) => {
        if (!canRequestAlbums) return;
        try {
            setDownloadingId(releaseId);
            await api.post(`/releases/download/${albumMbid}`);
            await fetchReleases();
        } catch (err) {
            notify.error(t("Couldn't start the download"), { message: err instanceof Error ? err.message : undefined });
        } finally {
            setDownloadingId(null);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return t("Today");
        if (diffDays === 1) return t("Tomorrow");
        if (diffDays > 0 && diffDays <= 7) return `${t("In")} ${diffDays} ${t("days")}`;
        if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} ${t("days ago")}`;

        return date.toLocaleDateString(locale === "nl" ? "nl-NL" : "en-US", {
            month: "short",
            day: "numeric",
            year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (error) {
        return (
            <PageMessage
                title={t("Couldn't load releases")}
                description={error}
                action={{ label: t("Try again"), onClick: () => { setError(null); fetchReleases(); } }}
            />
        );
    }

    return (
        <div className="min-h-screen pb-32">
            <PageHeader
                eyebrow={t("Release radar")}
                title={t("New and upcoming")}
                description={
                    data?.monitoredArtistCount
                        ? [
                              `${data.monitoredArtistCount} ${t(data.monitoredArtistCount === 1 ? "monitored artist" : "monitored artists")}`,
                              `${data.upcoming.length} ${t("upcoming")}`,
                              `${data.recent.length} ${t("recent")}`,
                          ].join(" · ")
                        : undefined
                }
            />

            <div className="page-shell space-y-10 animate-rise">
                {data?.upcoming && data.upcoming.length > 0 && (
                    <ReleaseSection
                        icon={<Clock className="w-5 h-5 text-brand" />}
                        title={t("Coming Soon")}
                        releases={data.upcoming}
                        formatDate={formatDate}
                        onDownload={handleDownload}
                        downloadingId={downloadingId}
                    />
                )}

                {data?.recent && data.recent.length > 0 && (
                    <ReleaseSection
                        icon={<Disc className="w-5 h-5 text-success" />}
                        title={t("Just Dropped")}
                        releases={data.recent}
                        formatDate={formatDate}
                        onDownload={handleDownload}
                        downloadingId={downloadingId}
                    />
                )}

                {(!data?.upcoming?.length && !data?.recent?.length) && (
                    <EmptyState
                        icon={<Calendar className="w-16 h-16" />}
                        title={t("No releases found")}
                        description={t("Add artists to Lidarr and enable monitoring to see their upcoming and recent releases here.")}
                    >
                        <Link href="/settings" className={buttonClass("primary")}>
                            {t("Configure Lidarr")}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </EmptyState>
                )}
            </div>
        </div>
    );
}

function ReleaseSection({
    icon,
    title,
    releases,
    formatDate,
    onDownload,
    downloadingId,
}: {
    icon: ReactNode;
    title: string;
    releases: ReleaseItem[];
    formatDate: (date: string) => string;
    onDownload: (albumMbid: string, releaseId: string | number) => void;
    downloadingId: string | number | null;
}) {
    return (
        <section>
            <div className="flex items-center gap-3 mb-6">
                {icon}
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                <span className="text-[var(--text-muted)] text-sm">({releases.length})</span>
            </div>

            <div className="grid-media">
                {releases.map((release) => (
                    <ReleaseCard
                        key={`${release.albumMbid}-${release.id}`}
                        release={release}
                        formatDate={formatDate}
                        onDownload={onDownload}
                        isDownloading={downloadingId === release.id}
                    />
                ))}
            </div>
        </section>
    );
}

function ReleaseCard({
    release,
    formatDate,
    onDownload,
    isDownloading,
}: {
    release: ReleaseItem;
    formatDate: (date: string) => string;
    onDownload: (albumMbid: string, releaseId: string | number) => void;
    isDownloading: boolean;
}) {
    const { canRequestAlbums } = useMusicPermissions();
    const { t } = useLanguage();
    const isUpcoming = release.status === "upcoming";
    const hasIt = release.inLibrary;

    return (
        <MediaCard
            title={release.title}
            subtitle={release.artistName}
            imageUrl={release.coverUrl ? api.getCoverArtUrl(release.coverUrl, 500) : null}
            fallbackIcon={Disc}
            type="album"
            badge={
                <span
                    className={cn(
                        "block px-2 py-1 rounded text-xs font-medium",
                        isUpcoming ? "bg-brand text-black" : hasIt ? "bg-success/90 text-black" : "bg-white/20 text-white",
                    )}
                >
                    {isUpcoming ? formatDate(release.releaseDate) : hasIt ? t("In Library") : t("Available")}
                </span>
            }
            corner={hasIt && <CheckCircle2 className="w-5 h-5 text-success" aria-label={t("In library")} />}
            action={
                canRequestAlbums && release.canDownload && !hasIt
                    ? {
                          icon: Download,
                          label: t("Request album"),
                          onClick: () => onDownload(release.albumMbid, release.id),
                          busy: isDownloading,
                      }
                    : undefined
            }
        />
    );
}
