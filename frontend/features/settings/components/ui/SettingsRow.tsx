import type { ReactNode } from "react";

interface SettingsRowProps {
    label: string;
    description?: ReactNode;
    children: ReactNode;
    htmlFor?: string;
}

export function SettingsRow({ label, description, children, htmlFor }: SettingsRowProps) {
    const labelClass = "block text-sm font-medium leading-snug text-[var(--text-primary)]";

    return (
        <div className="flex min-w-0 flex-col gap-3 border-b border-white/[0.055] py-4 last:border-b-0 sm:min-h-[68px] sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
                {htmlFor ? (
                    <label htmlFor={htmlFor} className={labelClass + " cursor-pointer"}>{label}</label>
                ) : (
                    <p className={labelClass}>{label}</p>
                )}
                {description && (
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
                        {description}
                    </p>
                )}
            </div>
            <div className="min-w-0 w-full sm:w-[min(100%,22rem)] sm:shrink-0 sm:text-right xl:w-[min(100%,25rem)]">
                {children}
            </div>
        </div>
    );
}
