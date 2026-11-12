import type { Locale } from "@/lib/i18n/translations";
import type { LucideIcon } from "lucide-react";
import {
    AudioLines,
    BookOpenText,
    Brush,
    Database,
    Download,
    HardDrive,
    Headphones,
    Image as ImageIcon,
    Languages,
    ListMusic,
    MonitorPlay,
    Network,
    Radio,
    ScanSearch,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    UserRound,
    UsersRound,
    Wrench,
} from "lucide-react";

export type SettingsGroupId = "personal" | "appearance" | "connections" | "library" | "administration";

export interface SettingsItem {
    id: string;
    label: string;
    group: SettingsGroupId;
    icon: LucideIcon;
    adminOnly?: boolean;
}

export interface SettingsGroup {
    id: SettingsGroupId;
    icon: LucideIcon;
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
    { id: "personal", icon: UserRound },
    { id: "appearance", icon: Brush },
    { id: "connections", icon: Network },
    { id: "library", icon: BookOpenText },
    { id: "administration", icon: ShieldCheck },
];

// Keep these IDs aligned with the existing SettingsSection IDs. Never expose
// nonexistent navigation targets or admin-only entries to ordinary members.
export const SETTINGS_ITEMS: SettingsItem[] = [
    { id: "account", label: "Account", group: "personal", icon: UserRound },
    { id: "language", label: "Language", group: "personal", icon: Languages },
    { id: "subsonic", label: "Native Apps", group: "personal", icon: Headphones },
    { id: "playback", label: "Playback", group: "personal", icon: MonitorPlay },
    { id: "scrobbling", label: "Scrobbling", group: "personal", icon: Radio },
    { id: "branding", label: "Branding", group: "appearance", icon: Brush, adminOnly: true },
    { id: "download-preferences", label: "Download Preferences", group: "connections", icon: SlidersHorizontal, adminOnly: true },
    { id: "lidarr", label: "Download Services", group: "connections", icon: Download, adminOnly: true },
    { id: "audiobookshelf", label: "Media Servers", group: "connections", icon: AudioLines, adminOnly: true },
    { id: "soulseek", label: "P2P Networks", group: "connections", icon: Network, adminOnly: true },
    { id: "artwork", label: "Artwork", group: "library", icon: ImageIcon, adminOnly: true },
    { id: "storage", label: "Storage", group: "library", icon: HardDrive, adminOnly: true },
    { id: "cache", label: "Library Enrichment", group: "library", icon: Sparkles, adminOnly: true },
    { id: "library-doctor", label: "Library Doctor", group: "library", icon: ScanSearch, adminOnly: true },
    { id: "smart-download-inbox", label: "Smart Download Inbox", group: "library", icon: ListMusic, adminOnly: true },
    { id: "corrupt-tracks", label: "Corrupt Tracks", group: "library", icon: Wrench, adminOnly: true },
    { id: "users", label: "Users", group: "administration", icon: UsersRound, adminOnly: true },
];

interface GroupCopy {
    title: string;
    description: string;
}

interface SettingsCopy {
    overview: string;
    navigation: string;
    search: string;
    noResults: string;
    jump: string;
    categories: string;
    intro: string;
    overviewTitle: string;
    overviewDescription: string;
    openCategory: string;
    administrator: string;
    sectionCount: string;
}

export const SETTINGS_COPY: Record<Locale, SettingsCopy> = {
    en: {
        overview: "Overview",
        navigation: "Settings navigation",
        search: "Find a setting",
        noResults: "No matching settings",
        jump: "Choose a setting",
        categories: "Settings categories",
        intro: "Everything that makes this music space yours, organised in one place.",
        overviewTitle: "Your settings, at a glance",
        overviewDescription: "Choose an area to make changes. Other sections stay out of the way.",
        openCategory: "Open",
        administrator: "Administrator",
        sectionCount: "settings",
    },
    nl: {
        overview: "Overzicht",
        navigation: "Navigatie instellingen",
        search: "Zoek een instelling",
        noResults: "Geen instellingen gevonden",
        jump: "Kies een instelling",
        categories: "Instellingencategorieën",
        intro: "Alles voor jouw muziekserver, overzichtelijk op één plek.",
        overviewTitle: "Jouw instellingen in één oogopslag",
        overviewDescription: "Kies een onderdeel om iets aan te passen. De rest blijft uit beeld.",
        openCategory: "Openen",
        administrator: "Beheerder",
        sectionCount: "instellingen",
    },
};

export const SETTINGS_GROUP_COPY: Record<Locale, Record<SettingsGroupId, GroupCopy>> = {
    en: {
        personal: { title: "Personal", description: "Account, language and listening preferences" },
        appearance: { title: "Appearance", description: "Give your music space its own identity" },
        connections: { title: "Downloads & services", description: "Connect download sources and media services" },
        library: { title: "Music library", description: "Artwork, storage, maintenance and library health" },
        administration: { title: "Administration", description: "Manage people and access" },
    },
    nl: {
        personal: { title: "Persoonlijk", description: "Account, taal en luistervoorkeuren" },
        appearance: { title: "Weergave", description: "Geef je muziekserver een eigen uitstraling" },
        connections: { title: "Downloads & diensten", description: "Beheer downloadbronnen en mediaservices" },
        library: { title: "Muziekbibliotheek", description: "Artwork, opslag, onderhoud en bibliotheekcontrole" },
        administration: { title: "Beheer", description: "Gebruikers en toegangsrechten beheren" },
    },
};

export function visibleSettingsItems(isAdmin: boolean, items: SettingsItem[] = SETTINGS_ITEMS): SettingsItem[] {
    return items.filter(item => isAdmin || !item.adminOnly);
}

export function resolveSettingsHash(hash: string, isAdmin: boolean, items: SettingsItem[] = SETTINGS_ITEMS): string {
    const value = hash.replace(/^#/, "");
    const target = value === "enrichment-failures" ? "cache" : value;
    if (target === "overview" || !target) return "overview";
    return visibleSettingsItems(isAdmin, items).some(item => item.id === target) ? target : "overview";
}

export function getSettingsGroup(id: SettingsGroupId): SettingsGroup {
    return SETTINGS_GROUPS.find(group => group.id === id) ?? SETTINGS_GROUPS[0];
}
