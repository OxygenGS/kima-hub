import { ChevronDown } from "lucide-react";

interface Option {
    value: string;
    label: string;
    description?: string;
}

interface SettingsSelectProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    disabled?: boolean;
}

export function SettingsSelect({ id, value, onChange, options, disabled }: SettingsSelectProps) {
    return (
        <div className="relative min-w-0">
            <select
                id={id}
                value={value}
                onChange={event => onChange(event.target.value)}
                disabled={disabled}
                className="min-h-11 w-full text-left cursor-pointer appearance-none rounded-xl border border-white/10 bg-[var(--bg-tertiary)] px-3.5 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-white/20 hover:bg-[var(--bg-hover)] focus:border-brand/45 focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
    );
}
