interface SettingsToggleProps {
    id?: string;
    label?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function SettingsToggle({ id, label, checked, onChange, disabled }: SettingsToggleProps) {
    return (
        <label className={"relative inline-flex min-h-11 items-center " + (disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <input
                id={id}
                aria-label={label}
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                disabled={disabled}
                className="peer sr-only"
            />
            <span className={
                "relative block h-[27px] w-[47px] rounded-full border transition-colors duration-200 " +
                "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-secondary)] " +
                (checked ? "border-brand/60 bg-brand" : "border-white/15 bg-white/15")
            }>
                <span className={
                    "absolute left-[3px] top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow-sm transition-transform duration-200 " +
                    (checked ? "translate-x-[19px]" : "translate-x-0")
                } aria-hidden="true" />
            </span>
        </label>
    );
}
