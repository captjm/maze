// src/player/commands.ts

/**
 * "primary"  — the clip currently visible / playing (alpha = 1 - blend)
 * "secondary" — the incoming clip being cross-faded in (alpha = blend)
 *
 * These are ROLES, not physical <video> element identifiers.
 * MediaRuntime maps them to the actual elements via its internal swap state.
 */
export type VideoRole = "primary" | "secondary";

export type Command =
    | { type: "SET_SOURCE";       role: VideoRole; src: string }
    | { type: "PLAY";             role: VideoRole }
    | { type: "PAUSE";            role: VideoRole }
    | { type: "SET_CURRENT_TIME"; role: VideoRole; time: number }
    | { type: "SET_BLEND";        value: number }
    | { type: "SWAP" };