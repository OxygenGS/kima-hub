"use client";

import { useState } from "react";
import { SettingsSection, SettingsRow } from "../ui";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/lib/i18n/language-context";

export function CorruptTracksSection() {
    const { t, locale } = useLanguage();
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ["corrupt-tracks"],
        queryFn: () => api.getCorruptTracks(),
    });

    const deleteMutation = useMutation({
        mutationFn: () => api.deleteCorruptTracks(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corrupt-tracks"] });
            setShowConfirm(false);
        },
    });

    const count = data?.count ?? 0;
    const tracks = data?.tracks ?? [];

    return (
        <SettingsSection
            id="corrupt-tracks"
            title={t("Corrupt Tracks")}
            description={t("Tracks that could not be read or decoded during library scan")}
        >
            <SettingsRow
                label={t("Corrupt files detected")}
                description={t("These files failed audio analysis and may be incomplete or damaged")}
            >
                <div className="flex items-center gap-3">
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                    ) : (
                        <span className={`text-sm tabular-nums ${count > 0 ? "text-amber-400": "text-[var(--text-muted)]"}`}>
                            {count.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")} {t(count === 1 ? "file" : "files")}
                        </span>
                    )}
                </div>
            </SettingsRow>

            {count > 0 && (
                <>
                    <div className="px-4 py-2">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-2 text-xs tabular-nums text-[var(--text-muted)] hover:text-white/60 transition-colors"
                        >
                            {expanded ? (
                                <ChevronUp className="w-3 h-3" />
                            ) : (
                                <ChevronDown className="w-3 h-3" />
                            )}
                            {expanded ? t("Hide") : t("Show")} {t("details")}
                        </button>

                        {expanded && (
                            <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
                                {tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        className="flex items-start gap-3 px-3 py-2 bg-white/[0.02] rounded-lg"
                                    >
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/60 mt-0.5 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
                                                {track.title}
                                            </p>
                                            <p className="text-xs tabular-nums text-[var(--text-muted)] truncate">
                                                {track.artist} -- {track.album}
                                            </p>
                                            <p className="text-micro tabular-nums text-[var(--text-muted)] truncate mt-0.5">
                                                {track.filePath}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="px-4 py-2">
                        <button
                            onClick={() => setShowConfirm(true)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 text-xs tabular-nums text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {deleteMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                            )}
                            {t("Remove all corrupt tracks")}
                        </button>
                    </div>
                </>
            )}

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={() => deleteMutation.mutate()}
                title={t("Remove corrupt tracks")}
                message={`${t("This will permanently remove")} ${count.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")} ${t("corrupt")} ${t(count === 1 ? "track" : "tracks")} ${t("from your database. The files on disk will not be deleted.")}`}
                confirmText={t("Remove All")}
                variant="danger"
            />
        </SettingsSection>
    );
}
