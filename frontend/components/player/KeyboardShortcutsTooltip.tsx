"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";

export function KeyboardShortcutsTooltip() {
    const { t } = useLanguage();
    const [isVisible, setIsVisible] = useState(false);
    const popupId = useId();

    const shortcuts = [
        { key: "Space", action: "Play / Pause" },
        { key: "→", action: "Seek forward 10s" },
        { key: "←", action: "Seek backward 10s" },
        { key: "↑", action: "Volume up 10%" },
        { key: "↓", action: "Volume down 10%" },
        { key: "M", action: "Toggle mute" },
        { key: "N", action: "Next track" },
        { key: "P", action: "Previous track" },
        { key: "S", action: "Toggle shuffle" },
    ] as const;

    return (
        <div className="relative">
            <button
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                onClick={() => setIsVisible(!isVisible)}
                className="p-1.5 rounded transition-colors text-[var(--text-secondary)] hover:text-white"
                title={t("keyboard shortcuts")}
                aria-label={t("keyboard shortcuts")}
                aria-expanded={isVisible}
                aria-controls={isVisible ? popupId : undefined}
            >
                <Info className="w-3.5 h-3.5" />
            </button>

            {isVisible && (
                <div id={popupId} role="tooltip" className="animate-panel-up absolute bottom-full right-0 mb-2 w-64 bg-[var(--bg-hover)] border border-white/10 rounded-lg p-4 z-(--z-dropdown) backdrop-blur-xl">
                    <div className="absolute -bottom-1 right-3 w-2 h-2 bg-[var(--bg-hover)] border-r border-b border-white/10 rotate-45" />

                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        {t("Keyboard Shortcuts")}
                    </h3>

                    <div className="space-y-2">
                        {shortcuts.map((shortcut) => (
                            <div
                                key={shortcut.key}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="text-[var(--text-secondary)]">
                                    {t(shortcut.action)}
                                </span>
                                <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white tabular-nums text-xs min-w-[40px] text-center">
                                    {shortcut.key}
                                </kbd>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-micro text-[var(--text-muted)] leading-relaxed">
                            {t("Shortcuts work anywhere except when typing in text fields.")}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
