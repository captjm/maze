// src/player/MediaRuntime.ts
import type { Command, VideoRole } from "./commands";

export class MediaRuntime {
    private readonly slots: [HTMLVideoElement, HTMLVideoElement];
    private primaryIndex: 0 | 1 = 0;
    private blend = 0;

    constructor() {
        const a = document.getElementById("videoA") as HTMLVideoElement;
        const b = document.getElementById("videoB") as HTMLVideoElement;
        a.muted = true;
        b.muted = true;
        this.slots = [a, b];
    }

    private idx(role: VideoRole): 0 | 1 {
        return role === "primary" ? this.primaryIndex : (this.primaryIndex === 0 ? 1 : 0);
    }

    execute(commands: Command[]): void {
        for (const cmd of commands) {
            switch (cmd.type) {
                case "SWAP": {
                    this.primaryIndex = this.primaryIndex === 0 ? 1 : 0;
                    break;
                }
                case "SET_SOURCE": {
                    const slot = this.slots[this.idx(cmd.role)];
                    slot.src = cmd.src;
                    slot.load();
                    break;
                }
                case "PLAY": {
                    this.slots[this.idx(cmd.role)].play().catch(() => undefined);
                    break;
                }
                case "PAUSE": {
                    this.slots[this.idx(cmd.role)].pause();
                    break;
                }
                case "SET_CURRENT_TIME": {
                    this.slots[this.idx(cmd.role)].currentTime = cmd.time;
                    break;
                }
                case "SET_BLEND": {
                    this.blend = cmd.value;
                    break;
                }
            }
        }
    }

    /** Stop both videos and return to initial state, ready for rewind. */
    reset(): void {
        for (const slot of this.slots) {
            slot.pause();
            slot.removeAttribute("src");
            slot.load();
        }
        this.primaryIndex = 0;
        this.blend        = 0;
    }

    getPrimary():   HTMLVideoElement { return this.slots[this.primaryIndex]; }
    getSecondary(): HTMLVideoElement { return this.slots[this.primaryIndex === 0 ? 1 : 0]; }
    getBlend():     number           { return this.blend; }
}