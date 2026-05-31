// src/player/commands.ts

export type VideoRole = "primary" | "secondary";

export type Command =
    | { type: "SET_SOURCE"; role: VideoRole; src: string }
    | { type: "SET_BLEND";  value: number }
    | { type: "PLAY";  role: VideoRole }
    | { type: "PAUSE";  role: VideoRole }
    | { type: "SET_CURRENT_TIME"; role: VideoRole; time: number }
    | { type: "SWAP" };
