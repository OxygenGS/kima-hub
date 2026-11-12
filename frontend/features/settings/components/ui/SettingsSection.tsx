import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface SettingsSectionProps {
    id: string;
    title: string;
    description?: string;
    children: ReactNode;
    showSeparator?: boolean;
}

// Shared shell for the Settings Studio. All existing sections retain their
// original IDs, actions and data bindings; only their presentation changes.
export function SettingsSection({
    id,
    title,
    description,
    children,
    showSeparator = true,
}: SettingsSectionProps) {
    return (
        <section
            id={id}
            aria-label={title}
            className="scroll-mt-24 overflow-hidden rounded-[24px] border border-white/[0.10] bg-[var(--bg-secondary)] shadow-[0_20px_65px_rgba(0,0,0,0.16)] animate-rise"
        >
            <div className="border-b border-white/[0.07] bg-white/[0.015] px-5 py-5 sm:px-7 sm:py-6">
                <SectionHeader title={title} size="sm" className="!mb-0" />
                {description && (
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
                        {description}
                    </p>
                )}
            </div>

            <div className="min-w-0 space-y-1 px-5 py-3 sm:px-7 sm:py-4">
                {children}
            </div>

            {showSeparator && (
                <div aria-hidden="true" className="h-px bg-white/[0.025]" />
            )}
        </section>
    );
}
