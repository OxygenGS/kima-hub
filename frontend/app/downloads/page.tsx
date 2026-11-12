"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";

type Phase = "queued" | "processing" | "downloaded" | "failed" | "cancelled" | "unknown";
type Engine = "soulseek" | "lidarr" | "unknown";

interface DownloadJob {
    id: string;
    subject: string;
    engine: Engine;
    phase: Phase;
    createdAt: string;
}

interface DownloadOverview {
    items: DownloadJob[];
    total: number;
    hasMore: boolean;
}

const labels: Record<Phase, TranslationKey> = {
    queued: "Queued",
    processing: "Processing",
    downloaded: "Download complete (index not checked)",
    failed: "Failed",
    cancelled: "Cancelled",
    unknown: "Unknown status",
};

const POLL_MS = 10_000;

export default function DownloadsPage() {
    const { isAuthenticated, isLoading, user } = useAuth();
    if (isLoading || !isAuthenticated || !user) return null;
    return <AccountDownloads key={user.id} />;
}

function AccountDownloads() {
    const { t, locale } = useLanguage();
    const [downloads, setDownloads] = useState<DownloadOverview | null>(null);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;
        const refresh = async () => {
            if (cancelled || inFlight) return;
            inFlight = true;
            setRefreshing(true);
            try {
                const result = await api.get<DownloadOverview>("/download-manager/jobs?limit=50&offset=0");
                if (!cancelled) {
                    setDownloads(result);
                    setError(false);
                }
            } catch {
                if (!cancelled) {
                    setDownloads(null);
                    setError(true);
                }
            } finally {
                if (!cancelled) setRefreshing(false);
                inFlight = false;
            }
        };
        void refresh();
        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        const interval = window.setInterval(refreshWhenVisible, POLL_MS);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [reloadKey]);

    const formatTime = (value: string) => {
        const time = new Date(value);
        return Number.isFinite(time.valueOf())
            ? time.toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            }) : "";
    };

    return (
        <div className="pb-24">
            <PageHeader
                eyebrow={t("Downloads")}
                title={t("Download Manager")}
                description={t("Only your own jobs are shown. Completed transfers still need library verification.")}
                actions={
                    <button type="button" onClick={() => setReloadKey(n => n + 1)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                        aria-label={t("Refresh download status")}>
                        <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                        {t("Refresh")}
                    </button>
                }
            />
            <div className="page-shell space-y-6">
                <p className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("Only your own jobs are shown. Completed transfers still need library verification.")}
                </p>
                <section aria-labelledby="kima-downloads-title"
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 id="kima-downloads-title" className="text-lg font-semibold text-white">{t("Kima downloads")}</h2>
                        <span className="text-xs text-[var(--text-muted)]">{downloads ? downloads.total : ""}</span>
                    </div>
                    {error ? (
                        <StatusMessage text={t("Could not load Kima downloads.")} error />
                    ) : downloads === null ? (
                        <StatusMessage text={t("Loading...")} />
                    ) : downloads.items.length === 0 ? (
                        <StatusMessage text={t("No recent Kima downloads.")} />
                    ) : (
                        <div className="space-y-2">
                            {downloads.items.map(job => (
                                <article key={job.id} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3"
                                    aria-label={job.subject}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-white" title={job.subject}>{job.subject}</p>
                                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                                                {job.engine === "soulseek" ? "Soulseek" : job.engine === "lidarr" ? "Lidarr" : t("Unknown source")}
                                                {" · "}{formatTime(job.createdAt)}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                                            {job.phase === "downloaded" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                                            {t(labels[job.phase] ?? labels.unknown)}
                                        </span>
                                    </div>
                                </article>
                            ))}
                            {downloads.hasMore && (
                                <p className="pt-2 text-xs text-[var(--text-muted)]">
                                    {t("Showing the newest 50 jobs.")}
                                </p>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function StatusMessage({ text, error = false }: { text: string; error?: boolean }) {
    return (
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-5 text-sm text-[var(--text-secondary)]" role="status">
            {error ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> :
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {text}
        </div>
    );
}
