// src/timeline/toCommands.ts
import type { PlaybackState } from "./types";
import type { Command } from "../player/commands";

/**
 * Stateful command producer. Call makeCommandProducer() once per playback
 * session; the returned function is called every animation frame.
 *
 * SWAP logic
 * ──────────
 * We track the assetId of what is currently loaded in the secondary slot.
 * SWAP is emitted exactly once: the first frame where the engine reports
 * the clip that was secondary is now primary (transition completed).
 *
 * PLAY is emitted only when src actually changes — not every frame —
 * to avoid interrupting the decoder.
 */
export function makeCommandProducer(assetMap: Map<string, string>) {
    // What assetId is currently in each logical role, as the runtime sees it
    let primaryAssetId:   string | null = null;
    let secondaryAssetId: string | null = null;

    return function stateToCommands(state: PlaybackState): Command[] {
        const cmds: Command[] = [];

        const wantPrimary   = state.primaryClip?.assetId   ?? null;
        const wantSecondary = state.secondaryClip?.assetId ?? null;

        // ── Detect completed transition → SWAP ────────────────────────────
        // The transition is done when what was secondary is now primary.
        // Emit SWAP first so subsequent SET_SOURCE commands address correct slots.
        if (
            secondaryAssetId !== null &&
            wantPrimary === secondaryAssetId &&
            wantSecondary !== secondaryAssetId
        ) {
            cmds.push({ type: "SWAP" });
            // After swap: our tracking flips too
            primaryAssetId   = secondaryAssetId;
            secondaryAssetId = null;
        }

        // ── Primary slot ──────────────────────────────────────────────────
        if (wantPrimary && wantPrimary !== primaryAssetId) {
            const src = assetMap.get(wantPrimary);
            if (src) {
                cmds.push({ type: "SET_SOURCE", role: "primary", src });
                cmds.push({ type: "PLAY",       role: "primary" });
                primaryAssetId = wantPrimary;
            }
        }

        // ── Secondary slot (idle buffer — safe to write) ──────────────────
        if (wantSecondary && wantSecondary !== secondaryAssetId) {
            const src = assetMap.get(wantSecondary);
            if (src) {
                cmds.push({ type: "SET_SOURCE", role: "secondary", src });
                cmds.push({ type: "PLAY",       role: "secondary" });
                secondaryAssetId = wantSecondary;
            }
        }

        // ── Blend value ───────────────────────────────────────────────────
        cmds.push({ type: "SET_BLEND", value: state.transitionProgress });

        return cmds;
    };
}

/** Build the assetId → URL map from a timeline's asset list. */
export function buildAssetMap(assets: { id: string; url: string }[]): Map<string, string> {
    return new Map(assets.map(a => [a.id, a.url]));
}