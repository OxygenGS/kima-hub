"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { searchResultStore } from "@/lib/search-result-store";
import { api, getApiBaseUrl } from "@/lib/api";

/** In proxy mode this is "", so events go through the streaming route in app/api/events. */
function getSSEBaseUrl(): string {
    if (typeof window === "undefined") return "";
    return getApiBaseUrl();
}

export function useEventSource() {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);

    useEffect(() => {
        if (!isAuthenticated) {
            reconnectAttemptsRef.current = 0;
            return;
        }

        let mounted = true;

        function scheduleReconnect() {
            if (!mounted) return;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null;
                void connect();
            }, delay);
        }

        async function connect() {
            if (!mounted) return;
            try {
                const ticket = await api.getSSETicket();
                if (!mounted) return;
                // A failed ticket fetch is common during a network handoff.
                if (!ticket) {
                    scheduleReconnect();
                    return;
                }
                const es = new EventSource(`${getSSEBaseUrl()}/api/events?ticket=${encodeURIComponent(ticket)}`);
                eventSourceRef.current = es;

            es.onmessage = (event) => {
                if (!mounted || eventSourceRef.current !== es) return;
                try {
                    const data = JSON.parse(event.data);

                    switch (data.type) {
                        case "notification":
                        case "notification:cleared":
                        case "notification:read":
                            queryClient.invalidateQueries({ queryKey: ["notifications"] });
                            if (data.notificationType === "playlist_ready" || data.notificationType === "import_complete") {
                                queryClient.invalidateQueries({ queryKey: ["playlists"] });
                            }
                            break;
                        case "download:complete":
                            queryClient.invalidateQueries({ queryKey: ["active-downloads"] });
                            queryClient.invalidateQueries({ queryKey: ["download-history"] });
                            queryClient.invalidateQueries({ queryKey: ["notifications"] });
                            if (data.albumId) {
                                queryClient.invalidateQueries({ queryKey: ["album", data.albumId] });
                            }
                            break;
                        case "download:failed":
                            queryClient.invalidateQueries({ queryKey: ["active-downloads"] });
                            queryClient.invalidateQueries({ queryKey: ["download-history"] });
                            queryClient.invalidateQueries({ queryKey: ["notifications"] });
                            break;
                        case "search:result":
                            if (data.searchId && data.results) {
                                searchResultStore.push(data.searchId, data.results);
                            }
                            break;
                        case "search:complete":
                            if (data.searchId) {
                                searchResultStore.complete(data.searchId);
                            }
                            break;
                        case "scan:progress":
                            queryClient.setQueryData(
                                ["scan-status", data.jobId],
                                { status: "active", progress: data.progress, jobId: data.jobId }
                            );
                            break;
                        case "scan:complete":
                            queryClient.setQueryData(
                                ["scan-status", data.jobId],
                                { status: data.error ? "failed" : "completed", progress: 100, jobId: data.jobId, result: data.result, error: data.error }
                            );
                            queryClient.invalidateQueries({ queryKey: ["enrichment-progress"] });
                            queryClient.invalidateQueries({ queryKey: ["library", "recently-added"] });
                            if (!data.error) {
                                // Indexing a new Soulseek single changes live
                                // availability even on cached MusicBrainz pages.
                                queryClient.invalidateQueries({ queryKey: ["album"] });
                                queryClient.invalidateQueries({ queryKey: ["artist"] });
                                queryClient.invalidateQueries({ queryKey: ["library", "albums"] });
                                queryClient.invalidateQueries({ queryKey: ["library", "artists"] });
                            }
                            break;
                        case "enrichment:progress":
                            queryClient.invalidateQueries({ queryKey: ["enrichment-progress"] });
                            break;
                        case "import:progress":
                            queryClient.setQueryData(
                                ["import-status", data.jobId],
                                data
                            );
                            queryClient.invalidateQueries({ queryKey: ["user-imports"] });
                            if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
                                queryClient.invalidateQueries({ queryKey: ["notifications"] });
                                queryClient.invalidateQueries({ queryKey: ["playlists"] });
                            }
                            break;
                        case "discover:progress":
                            queryClient.setQueryData(
                                ["discover-batch-status"],
                                { active: true, status: data.status, batchId: data.batchId, progress: data.progress, completed: data.completed, failed: data.failed, total: data.total }
                            );
                            break;
                        case "discover:complete":
                            queryClient.setQueryData(
                                ["discover-batch-status"],
                                { active: false, status: null, batchId: data.batchId }
                            );
                            queryClient.invalidateQueries({ queryKey: ["discover-playlist"] });
                            break;
                        case "preview:progress":
                            queryClient.setQueryData(
                                ["preview-status", data.jobId],
                                { status: "running", phase: data.phase, message: data.message, jobId: data.jobId }
                            );
                            break;
                        case "preview:complete":
                            queryClient.setQueryData(
                                ["preview-status", data.jobId],
                                { status: data.error ? "failed" : "completed", preview: data.preview, error: data.error, jobId: data.jobId }
                            );
                            break;
                        case "playlist:updated":
                            if (data.playlistId) {
                                queryClient.invalidateQueries({ queryKey: ["playlists"] });
                                queryClient.invalidateQueries({ queryKey: ["playlist", data.playlistId] });
                            }
                            break;
                        case "connected":
                            // Only refetch on reconnect (not initial connect) to avoid
                            // duplicate requests when queries were just fetched on mount.
                            if (reconnectAttemptsRef.current > 0) {
                                // While offline we may have missed scan, playlist,
                                // acquisition and ownership changes. Refresh only
                                // currently observed queries; inactive ones become stale.
                                for (const key of [
                                    ["notifications"], ["active-downloads"], ["download-history"],
                                    ["album"], ["artist"], ["library"], ["playlists"],
                                    ["scan-status"], ["user-imports"], ["enrichment-progress"],
                                ]) {
                                    void queryClient.invalidateQueries({ queryKey: key });
                                }
                            }
                            reconnectAttemptsRef.current = 0;
                            // A transient status failure must not overwrite a
                            // legitimate running batch with an invented idle state.
                            void api.getDiscoverBatchStatus()
                                .then(status => {
                                    if (mounted && eventSourceRef.current === es) {
                                        queryClient.setQueryData(["discover-batch-status"], status);
                                    }
                                })
                                .catch(() => {});
                            break;
                    }
                } catch {
                    // Ignore parse errors (heartbeat comments, etc.)
                }
            };

            es.onerror = () => {
                // Ignore a delayed error from a stream already replaced.
                if (eventSourceRef.current !== es) return;
                es.close();
                eventSourceRef.current = null;
                scheduleReconnect();
            };
            } catch {
                // Ticket failures or EventSource constructor errors must not
                // permanently disable live updates or cause unhandled promises.
                scheduleReconnect();
            }
        }

        void connect();

        return () => {
            mounted = false;
            reconnectAttemptsRef.current = 0;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [isAuthenticated, queryClient]);
}
