"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, LayoutGrid, Settings2 } from "lucide-react";
import { SettingsSidebar } from "./SettingsSidebar";
import {
    SETTINGS_COPY,
    SETTINGS_GROUPS,
    SETTINGS_GROUP_COPY,
    visibleSettingsItems,
    type SettingsItem,
} from "./SettingsNavigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";

interface SettingsLayoutProps {
    children: ReactNode;
    footer?: ReactNode;
    sidebarItems: SettingsItem[];
    isAdmin: boolean;
    activeSection: string;
    onSectionChange: (section: string) => void;
}

export function SettingsLayout({
    children,
    footer,
    sidebarItems,
    isAdmin,
    activeSection,
    onSectionChange,
}: SettingsLayoutProps) {
    const { locale, t } = useLanguage();
    const copy = SETTINGS_COPY[locale];
    const visibleItems = visibleSettingsItems(isAdmin, sidebarItems);
    const currentItem = visibleItems.find(item => item.id === activeSection);
    const currentGroup = currentItem ? SETTINGS_GROUP_COPY[locale][currentItem.group] : null;
    const groups = SETTINGS_GROUPS.map(group => ({
        ...group,
        items: visibleItems.filter(item => item.group === group.id),
    })).filter(group => group.items.length > 0);

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-8">
            <PageHeader
                eyebrow={t("System Configuration")}
                title={t("Settings")}
                description={copy.intro}
                className="pb-5"
            />

            <div className="page-shell">
                <div className="relative mb-6 overflow-hidden rounded-[25px] border border-white/[0.09] bg-[var(--bg-secondary)] p-5 md:px-7 md:py-6">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_88%_5%,rgba(252,162,0,0.10),transparent_50%),radial-gradient(ellipse_at_5%_95%,rgba(119,59,151,0.13),transparent_55%)]" />
                    <div className="relative flex items-center gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
                            <Settings2 className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-brand">{copy.overview}</p>
                            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{copy.overviewDescription}</p>
                        </div>
                    </div>
                </div>

                <div className="mb-5 space-y-3 lg:hidden">
                    <nav aria-label={copy.categories} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        <button
                            type="button"
                            onClick={() => onSectionChange("overview")}
                            aria-current={activeSection === "overview" ? "page" : undefined}
                            className={
                                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 " +
                                (activeSection === "overview"
                                    ? "border-brand/30 bg-brand/10 text-brand"
                                    : "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]")
                            }
                        >
                            <LayoutGrid className="h-4 w-4" aria-hidden="true" />{copy.overview}
                        </button>
                        {groups.map(group => {
                            const selected = group.items.some(item => item.id === activeSection);
                            const Icon = group.icon;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => onSectionChange(group.items[0].id)}
                                    aria-current={selected ? "page" : undefined}
                                    className={
                                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 " +
                                        (selected
                                            ? "border-brand/30 bg-brand/10 text-brand"
                                            : "border-white/10 bg-white/[0.04] text-[var(--text-secondary)]")
                                    }
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {SETTINGS_GROUP_COPY[locale][group.id].title}
                                </button>
                            );
                        })}
                    </nav>
                    <label className="relative block">
                        <span className="sr-only">{copy.jump}</span>
                        <select
                            value={activeSection}
                            onChange={event => onSectionChange(event.target.value)}
                            className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-[var(--bg-secondary)] px-4 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                        >
                            <option value="overview">{copy.overview}</option>
                            {groups.map(group => (
                                <optgroup key={group.id} label={SETTINGS_GROUP_COPY[locale][group.id].title}>
                                    {group.items.map(item => (
                                        <option key={item.id} value={item.id}>{translate(locale, item.label)}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                    </label>
                </div>

                <div className="flex items-start gap-5 xl:gap-7">
                    <SettingsSidebar
                        items={sidebarItems}
                        activeSection={activeSection}
                        onSectionClick={onSectionChange}
                        isAdmin={isAdmin}
                    />

                    <main id="settings-main" className="min-w-0 flex-1 scroll-mt-24">
                        {activeSection === "overview" ? (
                            <div>
                                <div className="mb-5">
                                    <p className="t-eyebrow">{t("Settings")}</p>
                                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-2xl">
                                        {copy.overviewTitle}
                                    </h2>
                                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                                        {copy.overviewDescription}
                                    </p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {groups.map(group => {
                                        const Icon = group.icon;
                                        const detail = SETTINGS_GROUP_COPY[locale][group.id];
                                        return (
                                            <button
                                                key={group.id}
                                                type="button"
                                                onClick={() => onSectionChange(group.items[0].id)}
                                                className="group relative flex min-h-[184px] flex-col items-start overflow-hidden rounded-[24px] border border-white/[0.09] bg-[var(--bg-secondary)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/25 hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 md:p-6"
                                            >
                                                <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/[0.04] blur-2xl transition-colors group-hover:bg-brand/[0.10]" />
                                                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-brand/15 bg-brand/[0.09] text-brand">
                                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                                </span>
                                                <span className="mt-4 flex w-full items-center justify-between gap-2 text-base font-semibold tracking-tight text-[var(--text-primary)]">
                                                    {detail.title}
                                                    <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-brand" aria-hidden="true" />
                                                </span>
                                                <span className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{detail.description}</span>
                                                <span className="mt-auto pt-4 text-[11px] font-semibold text-[var(--text-muted)]">
                                                    {group.items.length} {copy.sectionCount}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="mb-5 flex items-start gap-3 sm:gap-4">
                                {currentItem && (
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/15 bg-brand/[0.09] text-brand">
                                        <currentItem.icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                )}
                                <div className="min-w-0">
                                    {currentGroup && <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-brand">{currentGroup.title}</p>}
                                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-2xl">
                                        {currentItem ? translate(locale, currentItem.label) : t("Settings")}
                                    </h2>
                                    {currentGroup && <p className="mt-1 text-sm text-[var(--text-secondary)]">{currentGroup.description}</p>}
                                </div>
                            </div>
                        )}

                        <div hidden={activeSection === "overview"}>{children}</div>
                        {footer}
                    </main>
                </div>
            </div>
        </div>
    );
}
