// src/player/CanvasRenderer.ts

const READY = 2; // HTMLMediaElement.HAVE_CURRENT_DATA

export class CanvasRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    // Track last known size to avoid resetting canvas on every frame
    private lastW = 0;
    private lastH = 0;

    constructor() {
        this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot get 2D context from #canvas");
        this.ctx = ctx;
    }

    render(
        primary:   HTMLVideoElement,
        secondary: HTMLVideoElement,
        blend:     number
    ): void {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Only resize when the window actually changed — resizing resets the context
        if (w !== this.lastW || h !== this.lastH) {
            this.canvas.width  = w;
            this.canvas.height = h;
            this.lastW = w;
            this.lastH = h;
        }

        this.ctx.clearRect(0, 0, w, h);

        // Skip drawImage if video has no data yet — avoids black flash
        if (primary.readyState >= READY) {
            if (blend < 1) {
                this.ctx.globalAlpha = 1 - blend;
                this.ctx.drawImage(primary, 0, 0, w, h);
            }
        }

        if (blend > 0 && secondary.readyState >= READY) {
            this.ctx.globalAlpha = blend;
            this.ctx.drawImage(secondary, 0, 0, w, h);
        }

        this.ctx.globalAlpha = 1;
    }
}