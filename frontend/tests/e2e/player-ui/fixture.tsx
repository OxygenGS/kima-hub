import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MobilePlayer } from "../../../components/player/MobilePlayer";
import { OverlayPlayer } from "../../../components/player/OverlayPlayer";
import { state, defaults, calls } from "./mock-providers";

let generation = 0;
const root = createRoot(document.getElementById("player-root")!);
const api = {
    mount(kind: "mobile" | "overlay", patch: Partial<typeof defaults> = {}) {
        Object.assign(state, defaults, patch);
        calls.length = 0;
        generation++;
        flushSync(() => root.render(kind === "mobile" ? <MobilePlayer key={generation} /> : <OverlayPlayer key={generation} />));
    },
    calls,
};
(window as typeof window & { playerQa: typeof api }).playerQa = api;
