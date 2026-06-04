// src/test/MockVideoPlayer.ts
//
// Canvas-based simulated video player for browser testing.
//
// Renders into a <canvas> element:
//   - A "video frame" area (solid colour that changes per node, with node ID)
//   - A progress bar that animates in real time from MockDecoder tick events
//   - A loading/buffering indicator during the warm-up phase
//
// When the current segment ends (MockDecoder fires "ended"), shows a choice
// overlay with buttons for each output node. If the node has no outputs
// (terminal), shows an "end of story" screen.
//
// Communicates with the rest of the app only through:
//   - onDecoderEvent() — listens for tick/ended/lifecycle events
//   - onChoice callback — called when the viewer picks a branch

import { onDecoderEvent } from "./MockDecoder";
import type { TimelineGraph } from "../timeline/types";

// One deterministic colour per node ID (hashed from string).
function nodeColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    const h = hash % 360;
    return `hsl(${h}, 30%, 18%)`;
}

function nodeAccent(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 55%)`;
}

// Countdown before choices appear (ms) — gives the viewer a moment to react.
const CHOICE_DELAY_MS = 400;

export type ChoiceCallback = (nodeId: string) => Promise<void>;

export class MockVideoPlayer {
    private readonly canvas:  HTMLCanvasElement;
    //private readonly ctx:     CanvasRenderingContext2D;
    private readonly overlay: HTMLElement;         // choice buttons live here
    private graph: TimelineGraph | null = null;
    private onChoice: ChoiceCallback | null = null;

    // Playback state
    private currentSource: string = "";
    private currentNodeId: string = "";
    private progress:   number  = 0;              // [0, 1]
    private duration:   number  = 0;              // ms
    private elapsed:    number  = 0;              // ms
    private phase: "idle" | "buffering" | "playing" | "choices" | "ended" = "idle";

    // Animation
    private rafHandle: number | null = null;
    private choiceRevealTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(container: HTMLElement) {
        // Canvas fills the container
        this.canvas = document.createElement("canvas");
        this.canvas.style.cssText = "display:block;width:100%;height:100%;";
        container.appendChild(this.canvas);

        // Choice overlay — absolutely positioned over the canvas
        this.overlay = document.createElement("div");
        this.overlay.id = "mvp-choices";
        this.overlay.style.cssText = `
            position:absolute; inset:0;
            display:none;
            flex-direction:column;
            align-items:center; justify-content:flex-end;
            padding-bottom:72px; gap:12px;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%);
            pointer-events:none;
        `;
        container.style.position = "relative";
        container.appendChild(this.overlay);

        // Size canvas to container
        const ro = new ResizeObserver(() => this.resize());
        ro.observe(container);
        this.resize();

        // Start the render loop immediately — draws the idle screen
        this.startRenderLoop();

        // Subscribe to all decoder events globally
        onDecoderEvent(event => {
            // Only care about the decoder for the currently-playing node
            if (event.kind === "lifecycle") {
                if (event.source !== this.currentSource) return;

                if (event.method === "play" && event.phase === "start") {
                    // Decoder just started playing — clear buffering state
                    this.phase = "playing";
                    this.progress = 0;
                }
                if (event.method === "warm" && event.phase === "start") {
                    this.phase = "buffering";
                }
            }

            if (event.kind === "tick" && event.source === this.currentSource) {
                this.progress = event.progress;
                this.duration = event.duration;
                this.elapsed  = event.elapsed;
                this.phase    = "playing";
            }

            if (event.kind === "ended" && event.source === this.currentSource) {
                this.progress = 1;
                this.phase    = "choices";
                // Brief delay before showing choices so the progress bar
                // reaches 100% visibly before the overlay appears.
                this.choiceRevealTimer = setTimeout(() => {
                    this.showChoiceOverlay();
                }, CHOICE_DELAY_MS);
            }
        });

        console.log(this.rafHandle);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    setGraph(graph: TimelineGraph): void {
        this.graph = graph;
    }

    setChoiceCallback(cb: ChoiceCallback): void {
        this.onChoice = cb;
    }

    /**
     * Called when the app transitions to a new node.
     * Resets the canvas state and starts showing the buffering indicator
     * until the first tick arrives.
     */
    notifyNodeChanged(nodeId: string, source: string): void {
        this.currentNodeId = nodeId;
        this.currentSource = source;
        this.progress  = 0;
        this.elapsed   = 0;
        this.duration  = 0;
        this.phase     = "buffering";

        // Hide choice overlay from previous node
        this.hideChoiceOverlay();
        if (this.choiceRevealTimer !== null) {
            clearTimeout(this.choiceRevealTimer);
            this.choiceRevealTimer = null;
        }
    }

    // -----------------------------------------------------------------------
    // Render loop
    // -----------------------------------------------------------------------

    private startRenderLoop(): void {
        const draw = () => {
            this.render();
            this.rafHandle = requestAnimationFrame(draw);
        };
        this.rafHandle = requestAnimationFrame(draw);
    }

    private resize(): void {
        const dpr = window.devicePixelRatio ?? 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width  = rect.width  * dpr;
        this.canvas.height = rect.height * dpr;
    }

    private render(): void {
        const c   = this.canvas;
        const ctx = this.canvas.getContext("2d")!;
        const W = c.width, H = c.height;
        const dpr = window.devicePixelRatio ?? 1;

        ctx.clearRect(0, 0, W, H);

        if (this.phase === "idle") {
            this.drawIdle(ctx, W, H, dpr);
            return;
        }

        this.drawFrame(ctx, W, H, dpr);
        this.drawProgressBar(ctx, W, H, dpr);

        if (this.phase === "buffering") {
            this.drawBuffering(ctx, W, H, dpr);
        }
    }

    // -----------------------------------------------------------------------
    // Draw helpers
    // -----------------------------------------------------------------------

    /** Idle screen — shown before any graph is loaded. */
    private drawIdle(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number): void {
        ctx.fillStyle = "#0d0d14";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#2a2a3a";
        ctx.font      = `bold ${16 * dpr}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Load a graph to begin", W / 2, H / 2);
    }

    /** Node "video frame" — solid colour background + node ID centred. */
    private drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number): void {
        // Background colour unique to this node
        ctx.fillStyle = nodeColor(this.currentNodeId);
        ctx.fillRect(0, 0, W, H);

        // Subtle scanline texture
        for (let y = 0; y < H; y += 4 * dpr) {
            ctx.fillStyle = "rgba(0,0,0,0.08)";
            ctx.fillRect(0, y, W, dpr);
        }

        // Node ID — large, centred
        const accent = nodeAccent(this.currentNodeId);
        ctx.font         = `800 ${Math.round(28 * dpr)}px "Syne", "JetBrains Mono", monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = accent;
        ctx.fillText(this.currentNodeId, W / 2, H / 2 - 14 * dpr);

        // Source path — smaller, below
        ctx.font      = `${Math.round(11 * dpr)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(this.currentSource, W / 2, H / 2 + 16 * dpr);

        // Elapsed / duration counter
        if (this.duration > 0) {
            const elStr  = (this.elapsed  / 1000).toFixed(1);
            const durStr = (this.duration / 1000).toFixed(1);
            ctx.font      = `${Math.round(10 * dpr)}px "JetBrains Mono", monospace`;
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillText(`${elStr}s / ${durStr}s`, W / 2, H / 2 + 34 * dpr);
        }
    }

    /** Animated progress bar at the bottom of the canvas. */
    private drawProgressBar(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number): void {
        const BAR_H   = 4  * dpr;
        const PAD     = 0;
        const y       = H - BAR_H - PAD;
        const filled  = W * this.progress;
        const accent  = nodeAccent(this.currentNodeId);

        // Track
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, y, W, BAR_H);

        // Fill
        if (filled > 0) {
            ctx.fillStyle = accent;
            ctx.fillRect(0, y, filled, BAR_H);

            // Glow at the leading edge
            const grad = ctx.createLinearGradient(Math.max(0, filled - 40 * dpr), 0, filled, 0);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(1, "rgba(255,255,255,0.5)");
            ctx.fillStyle = grad;
            ctx.fillRect(Math.max(0, filled - 40 * dpr), y, Math.min(filled, 40 * dpr), BAR_H);
        }

        // Percentage label — right-aligned above bar
        ctx.font         = `${Math.round(9 * dpr)}px "JetBrains Mono", monospace`;
        ctx.textAlign    = "right";
        ctx.textBaseline = "bottom";
        ctx.fillStyle    = "rgba(255,255,255,0.35)";
        ctx.fillText(`${Math.round(this.progress * 100)}%`, W - 8 * dpr, y - 3 * dpr);
    }

    /** Spinning buffering indicator. */
    private drawBuffering(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number): void {
        // Semi-transparent overlay
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, W, H);

        // Spinning arc
        const cx = W / 2, cy = H / 2;
        const r  = 20 * dpr;
        const t  = performance.now() / 600;

        ctx.beginPath();
        ctx.arc(cx, cy, r, t, t + Math.PI * 1.4);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth   = 3 * dpr;
        ctx.lineCap     = "round";
        ctx.stroke();

        ctx.font         = `bold ${11 * dpr}px "JetBrains Mono", monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle    = "rgba(255,255,255,0.5)";
        ctx.fillText("BUFFERING", cx, cy + r + 10 * dpr);
    }

    // -----------------------------------------------------------------------
    // Choice overlay (HTML over canvas)
    // -----------------------------------------------------------------------

    private showChoiceOverlay(): void {
        if (!this.graph) return;

        const node = this.graph.nodes.get(this.currentNodeId);
        const outputs = node?.outputs ?? [];

        this.overlay.innerHTML = "";
        this.overlay.style.display = "flex";
        this.overlay.style.pointerEvents = "auto";

        if (outputs.length === 0) {
            // Terminal node
            const msg = document.createElement("div");
            msg.style.cssText = `
                font-family: "JetBrains Mono", monospace;
                font-size: 13px; font-weight: 700;
                color: rgba(255,255,255,0.6);
                letter-spacing: 2px; text-transform: uppercase;
                padding: 10px 20px;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                background: rgba(0,0,0,0.5);
            `;
            msg.textContent = "— END OF STORY —";
            this.overlay.appendChild(msg);
            this.phase = "ended";
            return;
        }

        // Label above buttons
        const label = document.createElement("div");
        label.style.cssText = `
            font-family: "JetBrains Mono", monospace;
            font-size: 9px; font-weight: 700; letter-spacing: 2px;
            color: rgba(255,255,255,0.4); text-transform: uppercase;
            margin-bottom: -4px;
        `;
        label.textContent = "Choose your path";
        this.overlay.appendChild(label);

        // Button row
        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; justify-content:center;";

        for (const outId of outputs) {
            const btn = document.createElement("button");

            const accent = nodeAccent(outId);
            btn.style.cssText = `
                padding: 10px 22px;
                background: rgba(0,0,0,0.75);
                border: 1.5px solid ${accent};
                color: ${accent};
                font-family: "JetBrains Mono", monospace;
                font-size: 12px; font-weight: 700;
                border-radius: 5px; cursor: pointer;
                transition: background 0.15s, transform 0.1s;
                letter-spacing: 0.5px;
                backdrop-filter: blur(4px);
            `;
            btn.textContent = outId;

            btn.addEventListener("mouseenter", () => {
                btn.style.background = accent;
                btn.style.color = "#000";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(0,0,0,0.75)";
                btn.style.color = accent;
            });

            btn.addEventListener("click", async () => {
                this.hideChoiceOverlay();
                if (this.onChoice) await this.onChoice(outId);
            });

            // Staggered fade-in animation via CSS
            btn.style.opacity = "0";
            btn.style.transform = "translateY(10px)";
            btn.style.transition = "opacity 0.25s, transform 0.25s, background 0.15s, color 0.15s";
            const delay = outputs.indexOf(outId) * 80;
            setTimeout(() => {
                btn.style.opacity = "1";
                btn.style.transform = "translateY(0)";
            }, delay);

            row.appendChild(btn);
        }

        this.overlay.appendChild(row);
        this.phase = "choices";
    }

    private hideChoiceOverlay(): void {
        this.overlay.style.display = "none";
        this.overlay.style.pointerEvents = "none";
        this.overlay.innerHTML = "";
    }
}