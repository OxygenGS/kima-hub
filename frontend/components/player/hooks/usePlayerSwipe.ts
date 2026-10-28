"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type TouchEvent } from "react";
import { horizontalSwipe } from "../playerPresentation";

/** Scope gestures to artwork/metadata, never transport or seek controls. */
export function usePlayerSwipe({ enabled, threshold, resetKey, onSwipe }: {
    enabled: boolean;
    threshold: number;
    resetKey: string;
    onSwipe: (direction: -1 | 1) => void;
}) {
    const origin = useRef<{ x: number; y: number } | null>(null);
    const delta = useRef({ x: 0, y: 0 });
    const suppressClickUntil = useRef(0);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        origin.current = null;
        delta.current = { x: 0, y: 0 };
        suppressClickUntil.current = 0;
        setOffset(0);
    }, [resetKey, enabled]);

    function reset() {
        origin.current = null;
        delta.current = { x: 0, y: 0 };
        setOffset(0);
    }

    function onTouchStart(event: TouchEvent) {
        reset();
        if (!enabled || event.touches.length !== 1 ||
            (event.target instanceof Element && event.target.closest("[data-player-command]"))) return;
        const touch = event.touches[0];
        origin.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
        if (!origin.current) return;
        if (event.touches.length !== 1) { reset(); return; }
        const touch = event.touches[0];
        const dx = touch.clientX - origin.current.x;
        const dy = touch.clientY - origin.current.y;
        // A vertical scroll cancels the gesture rather than accidentally changing music.
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
        delta.current = { x: dx, y: dy };
        setOffset(Math.abs(dx) > 10 ? Math.max(-150, Math.min(150, dx)) : 0);
    }

    function onTouchEnd(event: TouchEvent) {
        if (!origin.current || !enabled) { reset(); return; }
        const { x, y } = delta.current;
        const direction = horizontalSwipe(x, y, threshold);
        const moved = Math.abs(x) > 10 && Math.abs(x) > Math.abs(y);
        reset();
        if (moved) {
            suppressClickUntil.current = Date.now() + 500;
            if (event.cancelable) event.preventDefault();
        }
        if (direction) onSwipe(direction);
    }

    function onClickCapture(event: MouseEvent) {
        // Keyboard activation has detail=0 and must remain available after a swipe.
        if (event.detail !== 0 && Date.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    const style = {
        "--player-swipe-x": `${offset * .45}px`,
        "--player-swipe-opacity": String(1 - Math.abs(offset) / 500),
    } as CSSProperties;

    return { style, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset, onClickCapture };
}
