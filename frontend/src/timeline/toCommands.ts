// src/timeline/toCommands.ts
import type { PlaybackState } from "./types";
import type { Command }       from "../player/commands";

/**
 * Produces the minimal set of commands needed to keep the runtime in sync
 * with the current PlaybackState.
 *
 * Commands emitted:
 *   SET_SOURCE  — once per new assetId entering a role
 *   SWAP        — once when secondary becomes primary (transition complete)
 *   SET_BLEND   — every frame
 *
 * SET_CURRENT_TIME and PLAY are intentionally absent:
 *   - WebCodecsRuntime drives time itself via getFrames(mediaTime)
 *   - If a future runtime needs them, extend Command and add them here
 */
export function makeCommandProducer(assetMap: Map<string, string>) {
    let primaryAssetId:   string | null = null;
    let secondaryAssetId: string | null = null;

    return function stateToCommands(state: PlaybackState): Command[] {
        const cmds: Command[] = [];

        const wantPrimary   = state.primaryClip?.assetId   ?? null;
        const wantSecondary = state.secondaryClip?.assetId ?? null;

        // ── SWAP ──────────────────────────────────────────────────────────
        if (
            secondaryAssetId !== null &&
            wantPrimary      === secondaryAssetId &&
            wantSecondary    !== secondaryAssetId
        ) {
            cmds.push({ type: "SWAP" });
            primaryAssetId   = secondaryAssetId;
            secondaryAssetId = null;
        }

        // ── Primary ───────────────────────────────────────────────────────
        if (wantPrimary && wantPrimary !== primaryAssetId) {
            const src = assetMap.get(wantPrimary);
            if (src) {
                cmds.push({ type: "SET_SOURCE", role: "primary", src });
                primaryAssetId = wantPrimary;
            }
        }

        // ── Secondary ─────────────────────────────────────────────────────
        if (wantSecondary && wantSecondary !== secondaryAssetId) {
            const src = assetMap.get(wantSecondary);
            if (src) {
                cmds.push({ type: "SET_SOURCE", role: "secondary", src });
                secondaryAssetId = wantSecondary;
            }
        }

        // ── Blend ─────────────────────────────────────────────────────────
        cmds.push({ type: "SET_BLEND", value: state.transitionProgress });

        return cmds;
    };
}
