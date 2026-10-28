"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard focus in the player; closing never pauses or resumes audio. */
export function useOverlayFocus(open: boolean, surface: RefObject<HTMLDivElement | null>,
    closeButton: RefObject<HTMLButtonElement | null>, onClose: () => void) {
    const close = useRef(onClose);
    useEffect(() => { close.current = onClose; }, [onClose]);
    useEffect(() => {
        const root = surface.current;
        if (!open || !root) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButton.current?.focus();

        function handleKey(event: KeyboardEvent) {
            if (event.defaultPrevented || !root) return;
            if (event.key === "Escape") {
                // The existing sleep-timer dialog handles its own first Escape.
                if (root.querySelector('[role="dialog"]')) return;
                event.preventDefault();
                close.current();
            }
            if (event.key !== "Tab") return;
            const items = Array.from(root.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
            )).filter((node) => node.getClientRects().length > 0 &&
                !node.closest('[hidden], [aria-hidden="true"]'));
            const first = items[0];
            const last = items[items.length - 1];
            if (!first) { event.preventDefault(); root.focus(); return; }
            if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
                event.preventDefault(); first.focus();
            }
        }

        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("keydown", handleKey);
            if (document.body.style.overflow === "hidden") document.body.style.overflow = previousOverflow;
            if (previous?.isConnected) previous.focus();
        };
    }, [open, surface, closeButton]);
}
