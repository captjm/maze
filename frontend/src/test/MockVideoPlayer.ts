// src/test/MockVideoPlayer.ts

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
    return `hsl(${h}, 85%, 65%)`;
}

export class MockVideoPlayer {
    private readonly container: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly overlay: HTMLElement;

    private rafId: number | null = null;
    private isDestroyed: boolean = false;

    private graph: TimelineGraph | null = null;
    private currentNodeId: string | null = null;
    private currentSource: string | null = null;

    private phase: "idle" | "buffering" | "playing" | "choices" = "idle";
    private progress = 0; // 0..1
    private duration = 0;
    private currentTime = 0;

    private onChoice: ((nodeId: string) => Promise<void>) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;

        container.style.position = "relative";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.overflow = "hidden";
        container.style.background = "#0b0b12";

        this.canvas = document.createElement("canvas");
        this.canvas.style.display = "block";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        container.appendChild(this.canvas);

        this.overlay = document.createElement("div");
        this.overlay.style.position = "absolute";
        this.overlay.style.inset = "0";
        this.overlay.style.display = "none";
        this.overlay.style.flexDirection = "column";
        this.overlay.style.alignItems = "center";
        this.overlay.style.justifyContent = "center";
        this.overlay.style.background = "rgba(11,11,18,0.85)";
        this.overlay.style.zIndex = "10";
        container.appendChild(this.overlay);

        this.startRenderLoop();
        this.subscribeToDecoderEvents();
    }

    setGraph(graph: TimelineGraph): void {
        this.graph = graph;
    }

    setChoiceCallback(cb: (nodeId: string) => Promise<void>): void {
        this.onChoice = cb;
    }

    notifyNodeChanged(nodeId: string, source: string): void {
        this.currentNodeId = nodeId;
        this.currentSource = source;
        this.phase = "buffering";
        this.progress = 0;
        this.currentTime = 0;
        this.hideChoiceOverlay();
    }

    private startRenderLoop(): void {
        const draw = () => {
            if (this.isDestroyed) return;
            this.render();
            this.rafId = requestAnimationFrame(draw);
        };
        this.rafId = requestAnimationFrame(draw);
    }

    private render(): void {
        const rect = this.container.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0 || isNaN(rect.width) || isNaN(rect.height)) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const w = rect.width * dpr;
        const h = rect.height * dpr;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }

        const ctx = this.canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.scale(dpr, dpr);

        if (this.phase === "idle" || !this.currentNodeId) {
            this.drawIdle(ctx, rect.width, rect.height);
        } else {
            this.drawFrame(ctx, rect.width, rect.height);
            this.drawProgressBar(ctx, rect.width, rect.height);

            if (this.phase === "buffering") {
                this.drawBuffering(ctx, rect.width, rect.height);
            }
        }

        ctx.restore();
    }

    private drawIdle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.fillStyle = "#0c0c14";
        ctx.fillRect(0, 0, w, h);

        if (w <= 0 || h <= 0) return;

        ctx.fillStyle = "#3a3a54";
        ctx.font = `600 12px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const cx = w / 2;
        const cy = h / 2;
        if (!isNaN(cx) && !isNaN(cy) && isFinite(cx) && isFinite(cy)) {
            ctx.fillText("No video segment active", cx, cy);
        }
    }

    private drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const id = this.currentNodeId ?? "unknown";
        ctx.fillStyle = nodeColor(id);
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.font = `900 ${Math.min(w, h) * 0.2}px "Syne", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(id, w / 2, h / 2);

        ctx.fillStyle = nodeAccent(id);
        ctx.font = `700 14px "JetBrains Mono", monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`NODE: ${id}`, 20, 20);

        ctx.fillStyle = "#50507a";
        ctx.font = `400 10px "JetBrains Mono", monospace`;
        ctx.fillText(`SRC:  ${this.currentSource ?? "none"}`, 20, 40);
        ctx.fillText(`STATE: ${this.phase.toUpperCase()}`, 20, 54);

        const fmt = (s: number) => {
            const ms = Math.floor((s % 1) * 100);
            const sec = Math.floor(s);
            return `${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
        };
        ctx.fillStyle = "#c0c0d8";
        ctx.font = `700 12px "JetBrains Mono", monospace`;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${fmt(this.currentTime)} / ${fmt(this.duration)}`, w - 20, h - 25);
    }

    private drawProgressBar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const barH = 4;
        const y = h - barH;

        ctx.fillStyle = "#141424";
        ctx.fillRect(0, y, w, barH);

        if (this.currentNodeId) {
            ctx.fillStyle = nodeAccent(this.currentNodeId);
            ctx.fillRect(0, y, w * this.progress, barH);
        }
    }

    private drawBuffering(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.fillStyle = "rgba(11,11,18,0.6)";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#f59e0b";
        ctx.font = `700 11px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const dots = ".".repeat(1 + (Math.floor(Date.now() / 250) % 3));
        ctx.fillText(`BUFFERING${dots}`, w / 2, h / 2);
    }

    private subscribeToDecoderEvents(): void {
        onDecoderEvent(event => {
            if (this.isDestroyed || !this.currentSource || event.source !== this.currentSource) {
                return;
            }

            if (event.kind === "tick") {
                this.phase = "playing";

                this.currentTime = event.elapsed / 1000;
                this.duration = event.duration / 1000;

                this.progress = event.progress;
            } else if (event.kind === "ended") {
                this.phase = "choices";
                this.showChoiceOverlay();
            } else if (event.kind === "lifecycle") {
                if (event.method === "play" && event.phase === "end") {
                    this.phase = "playing";
                }
            }
        });
    }

    private showChoiceOverlay(): void {
        this.overlay.innerHTML = "";
        this.overlay.style.display = "flex";

        const title = document.createElement("div");
        title.style.cssText = `
            font-family: "Syne", sans-serif; font-size: 11px; font-weight:800;
            color: #50507a; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 24px;
        `;

        const id = this.currentNodeId;
        const node = id && this.graph ? this.graph.nodes.get(id) : null;
        const outputs = node ? node.outputs : [];

        if (outputs.length === 0) {
            title.textContent = "-- End of Timeline --";
            this.overlay.appendChild(title);
            return;
        }

        title.textContent = "Make your choice";
        this.overlay.appendChild(title);

        const row = document.createElement("div");
        row.style.cssText = "display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; max-width: 80%;";

        for (const outId of outputs) {
            const accent = nodeAccent(outId);
            const btn = document.createElement("button");
            btn.style.cssText = `
                background: rgba(0,0,0,0.75); border: 1px solid ${accent}; color: ${accent};
                font-family: "JetBrains Mono", monospace; font-size: 11px; font-weight: 700;
                padding: 10px 20px; min-width: 90px; border-radius: 5px; cursor: pointer;
                transition: background 0.15s, transform 0.1s; letter-spacing: 0.5px; backdrop-filter: blur(4px);
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
        this.overlay.innerHTML = "";
    }

    public destroy(): void {
        this.isDestroyed = true;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
        }
        this.hideChoiceOverlay();
        this.canvas.remove();
        this.overlay.remove();
    }
}