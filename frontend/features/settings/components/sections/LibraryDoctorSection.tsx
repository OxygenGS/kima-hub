"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { api, type LibraryDoctorReport, type LibraryDoctorTrackSample } from "@/lib/api";
import { SettingsSection } from "../ui";

/**
 * Explicitly triggered to avoid imposing database-wide counts on every visit
 * to Settings. Diagnostic data is never written back to the server.
 */
export function LibraryDoctorSection() {
    const { t, locale } = useLanguage();
    const [report, setReport] = useState<LibraryDoctorReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const inspect = async () => {
        if (loading) return;
        setLoading(true);
        setError(false);
        try {
            setReport(await api.getLibraryDoctorReport());
        } catch {
            setReport(null);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const format = (value: number) => new Intl.NumberFormat(locale).format(value);
    const metrics = report ? [
        { label: t("Indexed library tracks"), value: report.counts.libraryTracks },
        { label: t("Missing tracks"), value: report.counts.missingTracks },
        { label: t("Corrupt tracks"), value: report.counts.corruptTracks },
        { label: t("Albums without covers"), value: report.counts.albumsWithoutCover },
        { label: t("Artists without images"), value: report.counts.artistsWithoutImage },
        { label: t("Soulseek imports to review"), value: report.counts.importsToReview },
    ] : [];

    const sampleList = (label: string, items: LibraryDoctorTrackSample[]) => (
        <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
                {label} ({format(items.length)} {t("examples")})
            </summary>
            <ul className="mt-3 space-y-2">
                {items.map((item) => (
                    <li key={item.id} className="min-w-0 rounded-md bg-white/[0.03] px-3 py-2">
                        <p className="truncate text-sm text-white">{item.title}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                            {item.artist} · {item.album}
                        </p>
                        <p className="break-all text-xs text-[var(--text-muted)]">{item.filePath}</p>
                    </li>
                ))}
            </ul>
        </details>
    );

    return (
        <SettingsSection
            id="library-doctor"
            title={t("Library Doctor")}
            description={t("Inspect your indexed library for issues without changing your music.")}
        >
            <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => { void inspect(); }}
                        disabled={loading}
                        className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? t("Checking library...") : t("Run library check")}
                    </button>
                    {report && (
                        <time dateTime={report.generatedAt} className="text-xs text-[var(--text-muted)]">
                            {new Date(report.generatedAt).toLocaleString(locale)}
                        </time>
                    )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                    {t("Read-only: nothing is deleted, retagged or changed. Results reflect the last library scan, not a new disk scan.")}
                </p>
                {loading && <p role="status" className="text-xs text-[var(--text-secondary)]">{t("Checking library...")}</p>}
                {error && (
                    <p role="alert" className="text-xs text-red-400">
                        {t("Library check failed. Verify the server connection and try again.")}
                    </p>
                )}
                {report && (
                    <div aria-live="polite" className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {metrics.map((metric) => (
                                <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                    <p className="text-2xl font-semibold tabular-nums text-white">{format(metric.value)}</p>
                                    <p className="mt-1 text-xs text-[var(--text-muted)]">{metric.label}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                            {t("Review candidates are not confirmed errors. Counts may overlap. Only the first eight examples per category are shown.")}
                        </p>
                        {report.samples.importsToReview.length > 0 &&
                            sampleList(t("Soulseek imports to review"), report.samples.importsToReview)}
                        {report.samples.missingTracks.length > 0 &&
                            sampleList(t("Missing tracks"), report.samples.missingTracks)}
                        {report.counts.importsToReview === 0 && report.counts.missingTracks === 0 && (
                            <p className="text-xs text-[var(--text-secondary)]">
                                {t("No missing tracks or suspicious Soulseek imports found in the index.")}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}
