// src/player/WebCodecsRuntime.ts
//
// Replaces MediaRuntime for WebCodecs-based playback.
//
// Holds two ClipDecoder slots (primary / secondary) — the same double-buffer
// concept as MediaRuntime but operating on decoded VideoFrames instead of
// HTMLVideoElement.
//
// The SWAP command flips primaryIndex just like before.
// SET_SOURCE creates a new ClipDecoder asynchronously; the slot is ready
// once the promise resolves. Frames requested before that return null
// (CanvasRenderer / WebGLRenderer already handles null gracefully via readyState).

import { ClipDecoder } from "./ClipDecoder";

export type WebCodecsCommand =
    | { type: "SET_SOURCE"; role: "primary" | "secondary"; src: string }
    | { type: "SWAP" }
    | { type: "SET_BLEND"; value: number };

export class WebCodecsRuntime {
    private slots:        [ClipDecoder | null, ClipDecoder | null] = [null, null];
    private primaryIndex: 0 | 1 = 0;
    private blend = 0;

    // Track which URL is loaded per slot to avoid redundant decoders
    private slotSrc: [string | null, string | null] = [null, null];

    private get secondaryIndex(): 0 | 1 {
        return this.primaryIndex === 0 ? 1 : 0;
    }

    private slotFor(role: "primary" | "secondary"): 0 | 1 {
        return role === "primary" ? this.primaryIndex : this.secondaryIndex;
    }

    execute(commands: WebCodecsCommand[]): void {
        for (const cmd of commands) {
            switch (cmd.type) {

                case "SWAP": {
                    this.primaryIndex = this.secondaryIndex;
                    break;
                }

                case "SET_SOURCE": {
                    const idx = this.slotFor(cmd.role);
                    if (this.slotSrc[idx] === cmd.src) break; // already loaded

                    // Dispose old decoder for this slot
                    this.slots[idx]?.dispose();
                    this.slots[idx]  = null;
                    this.slotSrc[idx] = cmd.src;

                    // Create new decoder — runs in background
                    ClipDecoder.create(cmd.src).then(dec => {
                        // Guard: slot may have been reassigned while we awaited
                        if (this.slotSrc[idx] === cmd.src) {
                            this.slots[idx] = dec;
                        } else {
                            dec.dispose();
                        }
                    }).catch(e => console.error("[WebCodecsRuntime] SET_SOURCE failed:", e));

                    break;
                }

                case "SET_BLEND": {
                    this.blend = cmd.value;
                    break;
                }
            }
        }
    }

    /**
     * Returns the current VideoFrame pair for rendering.
     * Frames are owned by their FrameBuffers — do NOT close them.
     * Either may be null if the decoder hasn't buffered that position yet.
     */
    getFrames(primaryMediaTime: number, secondaryMediaTime: number): {
        primary:   VideoFrame | null;
        secondary: VideoFrame | null;
        blend:     number;
    } {
        const primaryDec   = this.slots[this.primaryIndex];
        const secondaryDec = this.slots[this.secondaryIndex];

        if (primaryDec)   primaryDec.evictBefore(primaryMediaTime);
        if (secondaryDec) secondaryDec.evictBefore(secondaryMediaTime);

        return {
            primary:   primaryDec?.getFrameAt(primaryMediaTime)   ?? null,
            secondary: secondaryDec?.getFrameAt(secondaryMediaTime) ?? null,
            blend:     this.blend,
        };
    }

    getBlend(): number { return this.blend; }

    reset(): void {
        for (let i = 0; i < 2; i++) {
            this.slots[i]?.dispose();
            this.slots[i]   = null;
            this.slotSrc[i] = null;
        }
        this.primaryIndex = 0;
        this.blend        = 0;
    }
}
