"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { cn } from "@/lib/cn";

interface SettingsInputProps {
    id?: string;
    type?: "text" | "password" | "url" | "number";
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function SettingsInput({
    id,
    type = "text",
    value,
    onChange,
    placeholder,
    disabled,
    className = "",
}: SettingsInputProps) {
    const [showPassword, setShowPassword] = useState(false);
    const { locale } = useLanguage();
    const isPassword = type === "password";

    return (
        <div className={cn("relative min-w-0", className)}>
            <input
                id={id}
                type={isPassword && showPassword ? "text" : type}
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                    "text-left min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5",
                    "text-sm text-[var(--text-primary)] outline-none transition-colors",
                    "placeholder:text-[var(--text-muted)] hover:border-white/20 hover:bg-white/[0.06]",
                    "focus:border-brand/45 focus:bg-white/[0.07] focus:ring-2 focus:ring-brand/20",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    isPassword && "pr-12",
                )}
            />
            {isPassword && (
                <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    disabled={disabled}
                    aria-label={showPassword
                        ? (locale === "nl" ? "Wachtwoord verbergen" : "Hide password")
                        : (locale === "nl" ? "Wachtwoord tonen" : "Show password")}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50"
                >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
            )}
        </div>
    );
}
