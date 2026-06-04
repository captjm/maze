// src/player/WebCodecsRuntime.ts
import { ClipDecoder } from "./ClipDecoder";

export type WebCodecsCommand =
    | { type: "SET_SOURCE"; role: "primary" | "secondary"; src: string }
    | { type: "SWAP" }
    | { type: "SET_BLEND"; value: number };

export class WebCodecsRuntime {
    private slots:        [ClipDecoder | null, ClipDecoder | null] = [null, null];
    private primaryIndex: 0 | 1 = 0;
    private blend  = 0;
    private slotSrc: [string | null, string | null] = [null, null];

    private get secondaryIndex(): 0 | 1 {
        return this.primaryIndex === 0 ? 1 : 0;
    }

    private idxFor(role: "primary" | "secondary"): 0 | 1 {
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
                    const idx = this.idxFor(cmd.role);
                    if (this.slotSrc[idx] === cmd.src) break;

                    this.slots[idx]?.dispose();
                    this.slots[idx]   = null;
                    this.slotSrc[idx] = cmd.src;

                    const src = cmd.src;
                    ClipDecoder.create(src)
                        .then(dec => {
                            if (this.slotSrc[idx] === src) {
                                this.slots[idx] = dec;
                            } else {
                                dec.dispose();
                            }
                        })
                        .catch(e => console.error("[WebCodecsRuntime] load failed:", src, e));
                    break;
                }

                case "SET_BLEND": {
                    this.blend = cmd.value;
                    break;
                }
            }
        }
    }

    getFrames(primaryMediaTime: number, secondaryMediaTime: number): {
        primary:   VideoFrame | null;
        secondary: VideoFrame | null;
        blend:     number;
    } {
        const pDec = this.slots[this.primaryIndex];
        const sDec = this.slots[this.secondaryIndex];

        if (pDec) pDec.evictBefore(primaryMediaTime);
        if (sDec) sDec.evictBefore(secondaryMediaTime);

        return {
            primary:   pDec?.getFrameAt(primaryMediaTime)   ?? null,
            secondary: sDec?.getFrameAt(secondaryMediaTime) ?? null,
            blend:     this.blend,
        };
    }

    reset(): void {
        this.slots[0]?.dispose();
        this.slots[1]?.dispose();
        this.slots    = [null, null];
        this.slotSrc  = [null, null];
        this.primaryIndex = 0;
        this.blend        = 0;
    }
}