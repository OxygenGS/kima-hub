"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { ListMusic, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { notify } from "@/lib/notify";
import { useFeatures } from "@/lib/features-context";
import { MobileSidebar } from "./MobileSidebar";
import { DesktopNavigation } from "./DesktopNavigation";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/language-context";

interface Playlist {
    id: string;
    name: string;
    trackCount: number;
    isHidden?: boolean;
    isOwner?: boolean;
    user?: { username: string };
}

export function Sidebar() {
    const pathname = usePathname();
    const { t, locale } = useLanguage();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isAuthenticated } = useAuth();
    const { audiobookshelfEnabled } = useFeatures();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isMobileOrTablet = isMobile || isTablet;
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const createPopoverRef = useRef<HTMLDivElement>(null);

    const { data: playlists = [], isLoading: isLoadingPlaylists } = useQuery<Playlist[]>({
        queryKey: ["playlists"],
        queryFn: () => api.getPlaylists(),
        enabled: isAuthenticated,
    });

    useEffect(() => {
        setIsMobileMenuOpen(false);
        setShowCreatePlaylist(false);
        setNewPlaylistName("");
    }, [pathname]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsMobileMenuOpen(false);
        };
        if (isMobileMenuOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "unset";
        };
    }, [isMobileMenuOpen]);

    useEffect(() => {
        const handleToggle = () => setIsMobileMenuOpen(true);
        window.addEventListener("toggle-mobile-menu", handleToggle);
        return () => window.removeEventListener("toggle-mobile-menu", handleToggle);
    }, []);

    useEffect(() => {
        if (!showCreatePlaylist) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (createPopoverRef.current && !createPopoverRef.current.contains(e.target as Node)) {
                setShowCreatePlaylist(false);
                setNewPlaylistName("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showCreatePlaylist]);

    const handleCreatePlaylist = async () => {
        const name = newPlaylistName.trim();
        if (!name || isCreating) return;
        try {
            setIsCreating(true);
            const result = await api.createPlaylist(name);
            await queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
            setShowCreatePlaylist(false);
            setNewPlaylistName("");
            router.push(`/playlist/${result.id}`);
        } catch {
            notify.error(t("Failed to create playlist"));
        } finally {
            setIsCreating(false);
        }
    };

    if (pathname === "/login") return null;
    const visiblePlaylists = playlists.filter((playlist) => !playlist.isHidden);

    return (
        <>
            {isMobileOrTablet ? (
                <MobileSidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
            ) : (
                <aside className="w-64 shrink-0 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col overflow-hidden relative z-(--z-raised) rounded-2xl">
                    <div className="min-h-0 overflow-y-auto shrink">
                        <DesktopNavigation pathname={pathname} audiobookshelfEnabled={!!audiobookshelfEnabled} />
                    </div>
                    <div ref={createPopoverRef} className="flex-1 min-h-32 flex flex-col overflow-hidden pb-3 normal-case">
                        <div className="flex items-center justify-between px-5 mb-2">
                            <Link href="/playlists" prefetch={false} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-white focus-visible:outline-2 focus-visible:outline-brand">
                                {locale === "nl" ? "Je afspeellijsten" : "Your playlists"}
                            </Link>
                            <div>
                                <button
                                    type="button"
                                    onClick={() => { setShowCreatePlaylist((open) => !open); setNewPlaylistName(""); }}
                                    className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-brand hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-brand"
                                    aria-label={t("Create playlist")}
                                    title={t("Create playlist")}
                                    aria-expanded={showCreatePlaylist}
                                >
                                    <Plus className="w-4 h-4" aria-hidden="true" />
                                </button>

                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 px-3">
                                {showCreatePlaylist && (
                                    <div className="relative mb-3 bg-[var(--bg-hover)] border border-white/10 rounded-xl p-3 shadow-xl">
                                        <input
                                            type="text"
                                            value={newPlaylistName}
                                            onChange={(e) => setNewPlaylistName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleCreatePlaylist();
                                                if (e.key === "Escape") { setShowCreatePlaylist(false); setNewPlaylistName(""); }
                                            }}
                                            placeholder={t("Playlist name")}
                                            aria-label={t("Playlist name")}
                                            autoFocus
                                            className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-brand/50"
                                        />
                                        <Button variant="primary" size="sm" onClick={handleCreatePlaylist} disabled={!newPlaylistName.trim() || isCreating} className="mt-2 w-full">
                                            {isCreating ? t("Creating...") : t("Create")}
                                        </Button>
                                    </div>
                                )}
                            {isLoadingPlaylists ? (
                                Array.from({ length: 3 }, (_, index) => (
                                    <div key={index} className="h-14 rounded-xl bg-white/5 motion-safe:animate-pulse" aria-hidden="true" />
                                ))
                            ) : visiblePlaylists.length > 0 ? visiblePlaylists.map((playlist) => {
                                const isActive = pathname === `/playlist/${playlist.id}`;
                                const isShared = playlist.isOwner === false;
                                return (
                                    <Link
                                        key={playlist.id}
                                        href={`/playlist/${playlist.id}`}
                                        prefetch={false}
                                        aria-current={isActive ? "page" : undefined}
                                        className={cn("flex items-center gap-3 p-2 rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-brand", isActive ? "bg-white/10 text-white" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white")}
                                    >
                                        <span className="w-10 h-10 shrink-0 grid place-items-center rounded-lg bg-[var(--bg-hover)] border border-white/5">
                                            <ListMusic className="w-4 h-4" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-xs font-semibold truncate" title={playlist.name}>{playlist.name}</span>
                                            <span className="block text-micro text-[var(--text-muted)] truncate mt-1">
                                                {playlist.trackCount} {locale === "nl" ? (playlist.trackCount === 1 ? "nummer" : "nummers") : (playlist.trackCount === 1 ? "track" : "tracks")}
                                                {isShared && ` / ${playlist.user?.username || (locale === "nl" ? "Gedeeld" : "Shared")}`}
                                            </span>
                                        </span>
                                    </Link>
                                );
                            }) : (
                                <p className="px-2 py-4 text-xs leading-relaxed text-[var(--text-muted)]">
                                    {locale === "nl" ? "Maak je eerste afspeellijst met de plusknop." : "Make your first playlist with the plus button."}
                                </p>
                            )}
                        </div>
                    </div>
                </aside>
            )}
        </>
    );
}
