"use client";

import { useMemo, useState } from "react";
import { ChevronRight, LayoutGrid, Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import {
    SETTINGS_COPY,
    SETTINGS_GROUPS,
    SETTINGS_GROUP_COPY,
    visibleSettingsItems,
    type SettingsItem,
} from "./SettingsNavigation";

export type SidebarItem = SettingsItem;

interface SettingsSidebarProps {
    items: SettingsItem[];
    activeSection: string;
    onSectionClick: (id: string) => void;
    isAdmin: boolean;
}

export function SettingsSidebar({ items, activeSection, onSectionClick, isAdmin }: SettingsSidebarProps) {
    const { locale } = useLanguage();
    const [search, setSearch] = useState("");
    const copy = SETTINGS_COPY[locale];
    const visible = useMemo(() => visibleSettingsItems(isAdmin, items), [items, isAdmin]);
    const needle = search.trim().toLocaleLowerCase(locale);
    const matches = visible.filter(item => {
        if (!needle) return true;
        const name = translate(locale, item.label);
        const group = SETTINGS_GROUP_COPY[locale][item.group];
        return [name, group.title, group.description].some(text => text.toLocaleLowerCase(locale).includes(needle));
    });

    return (
        <aside className="hidden w-[252px] shrink-0 lg:block xl:w-[268px]">
            <div className="sticky top-5 max-h-[calc(100dvh-2.5rem)] overflow-y-auto overscroll-contain rounded-[24px] border border-white/[0.09] bg-[var(--bg-secondary)] p-3 shadow-[0_24px_75px_rgba(0,0,0,0.18)]">
                <button
                    type="button"
                    onClick={() => onSectionClick("overview")}
                    aria-current={activeSection === "overview" ? "page" : undefined}
                    className={
                        "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 " +
                        (activeSection === "overview"
                            ? "bg-brand/12 text-brand"
                            : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]")
                    }
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/15 bg-current/5">
                        <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold">{copy.overview}</span>
                    <ChevronRight className="h-4 w-4 opacity-50" aria-hidden="true" />
                </button>

                <label className="relative mt-4 block">
                    <span className="sr-only">{copy.search}</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                    <input
                        type="search"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder={copy.search}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                    />
                </label>

                <nav aria-label={copy.navigation} className="mt-3 space-y-4">
                    {SETTINGS_GROUPS.map(group => {
                        const itemsInGroup = matches.filter(item => item.group === group.id);
                        if (itemsInGroup.length === 0) return null;
                        return (
                            <div key={group.id}>
                                <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
                                    {SETTINGS_GROUP_COPY[locale][group.id].title}
                                </p>
                                <div className="space-y-0.5">
                                    {itemsInGroup.map(item => {
                                        const active = activeSection === item.id;
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => onSectionClick(item.id)}
                                                aria-current={active ? "page" : undefined}
                                                className={
                                                    "group flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 " +
                                                    (active
                                                        ? "border-brand/20 bg-brand/[0.11] font-semibold text-brand"
                                                        : "border-transparent text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]")
                                                }
                                            >
                                                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
                                                <span className="min-w-0 flex-1 truncate">{translate(locale, item.label)}</span>
                                                {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {matches.length === 0 && (
                        <p className="px-3 py-5 text-center text-xs text-[var(--text-muted)]" role="status">
                            {copy.noResults}
                        </p>
                    )}
                </nav>
            </div>
        </aside>
    );
}
