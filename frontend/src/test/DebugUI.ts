// src/test/DebugUI.ts
//
// Interactive browser test harness for the Maze player.
//
// Layout (three columns):
//   Left sidebar  — SVG graph visualiser with live decoder-state badges
//   Centre        — MockVideoPlayer (canvas) with choice overlay
//   Right panel   — Decoder event log
//
// All DOM manipulation lives here; Application and PlaybackController are
// kept clean of any UI concerns.

import type { Application }   from "../app/Application";
import type { TimelineGraph }  from "../timeline/types";
import { onDecoderEvent }      from "./MockDecoder";
import { MockVideoPlayer }     from "./MockVideoPlayer";

// ---------------------------------------------------------------------------
// State colours — must match NodeState values from types.ts
// ---------------------------------------------------------------------------
const STATE_COLOR: Record<string, string> = {
    idle:     "#3a3a4a",
    loaded:   "#1d4ed8",
    demuxed:  "#7c3aed",
    warm:     "#d97706",
    playing:  "#16a34a",
};

const STATE_LABEL: Record<string, string> = {
    idle:    "IDLE",
    loaded:  "LOADED",
    demuxed: "DEMUXED",
    warm:    "WARM",
    playing: "PLAYING",
};

// Maps source path → nodeId for event colouring.
const sourceToNodeId = new Map<string, string>();

export class DebugUI {
    private readonly app: Application;
    private graph: TimelineGraph | null = null;
    private player: MockVideoPlayer | null = null;

    private graphContainer!:  HTMLElement;
    private playerContainer!: HTMLElement;
    private logContainer!:    HTMLElement;

    constructor(app: Application) {
        this.app = app;
        this.buildShell();
        this.subscribeToDecoderEvents();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    onGraphLoaded(graph: TimelineGraph): void {
        this.graph = graph;

        sourceToNodeId.clear();
        for (const node of graph.nodes.values()) {
            sourceToNodeId.set(node.source, node.id);
        }

        // Attach the graph reference to the video player so it can look up
        // output nodes when a segment ends.
        if (this.player) {
            this.player.setGraph(graph);
        }

        this.renderGraph();
        this.log("system", `Graph loaded · entry <b>${graph.entry}</b> · ${graph.nodes.size} nodes`);

        // Notify video player about the initial (entry) node.
        const entryNode = graph.nodes.get(graph.entry);
        if (entryNode && this.player) {
            this.player.notifyNodeChanged(entryNode.id, entryNode.source);
        }
    }

    // -----------------------------------------------------------------------
    // DOM scaffolding
    // -----------------------------------------------------------------------

    private buildShell(): void {
        const root = document.getElementById("debug-root")!;
        root.innerHTML = `
            <div class="dbg-layout">

                <!-- Left: graph visualiser -->
                <aside class="dbg-col dbg-left">
                    <div class="dbg-panel-title">Graph</div>
                    <div id="dbg-graph"></div>
                </aside>

                <!-- Centre: canvas video player -->
                <div class="dbg-col dbg-centre">
                    <div class="dbg-panel-title" id="dbg-now-playing">Player</div>
                    <div id="dbg-player-wrap"></div>
                </div>

                <!-- Right: event log -->
                <aside class="dbg-col dbg-right">
                    <div class="dbg-panel-title">Event log</div>
                    <div id="dbg-log"></div>
                </aside>

            </div>
        `;

        this.graphContainer  = document.getElementById("dbg-graph")!;
        this.playerContainer = document.getElementById("dbg-player-wrap")!;
        this.logContainer    = document.getElementById("dbg-log")!;

        // Create the canvas player and wire choice callback.
        this.player = new MockVideoPlayer(this.playerContainer);
        this.player.setChoiceCallback(async (nodeId) => {
            this.log("choice", `▶ chose <b>${nodeId}</b>`);
            await this.app.choose(nodeId);

            // After app.choose() resolves, the decoder for the new node is
            // already playing — notify the video player to reset its state.
            const node = this.graph?.nodes.get(nodeId);
            if (node) this.player!.notifyNodeChanged(node.id, node.source);

            this.updateNowPlaying(nodeId);
        });
    }

    private updateNowPlaying(nodeId: string): void {
        const el = document.getElementById("dbg-now-playing");
        if (el) el.textContent = `▶  ${nodeId}`;
    }

    // -----------------------------------------------------------------------
    // Graph visualiser (SVG)
    // -----------------------------------------------------------------------

    private renderGraph(): void {
        if (!this.graph) return;

        const nodes    = [...this.graph.nodes.values()];
        const layers   = this.computeLayers(this.graph);
        const maxLayer = Math.max(...layers.values());

        const COL_W  = 150;
        const ROW_H  = 88;
        const NODE_W = 124;
        const NODE_H = 52;
        const PAD    = 16;

        // Assign positions
        const layerCounts = new Map<number, number>();
        const pos = new Map<string, { x: number; y: number }>();

        for (const [id, layer] of layers) {
            const idx = layerCounts.get(layer) ?? 0;
            layerCounts.set(layer, idx + 1);
            pos.set(id, {
                x: PAD + idx * COL_W + COL_W / 2,
                y: PAD + layer * ROW_H + NODE_H / 2,
            });
        }

        // Re-centre each layer
        for (let l = 0; l <= maxLayer; l++) {
            const inLayer = [...layers.entries()]
                .filter(([, ly]) => ly === l)
                .map(([id]) => id);
            const maxX = Math.max(...[...pos.values()].map(p => p.x));
            const totalW = inLayer.length * COL_W;
            const svgW   = maxX + COL_W;
            const offset = (svgW - totalW) / 2;
            inLayer.forEach((id, i) => {
                const p = pos.get(id)!;
                p.x = offset + i * COL_W + COL_W / 2;
            });
        }

        const svgW = Math.max(280,
            Math.max(...[...pos.values()].map(p => p.x)) + PAD + NODE_W / 2);
        const svgH = (maxLayer + 1) * ROW_H + PAD * 2;

        const ns  = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
        svg.setAttribute("width",   String(svgW));
        svg.setAttribute("height",  String(svgH));
        svg.style.display = "block";

        // Defs: arrow marker
        const defs = document.createElementNS(ns, "defs");
        defs.innerHTML = `
            <marker id="arr" markerWidth="6" markerHeight="6"
                    refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#3a3a5a"/>
            </marker>`;
        svg.appendChild(defs);

        // Edges
        for (const node of nodes) {
            const from = pos.get(node.id)!;
            for (const outId of node.outputs) {
                const to = pos.get(outId);
                if (!to) continue;
                const line = document.createElementNS(ns, "line");
                line.setAttribute("x1", String(from.x));
                line.setAttribute("y1", String(from.y + NODE_H / 2));
                line.setAttribute("x2", String(to.x));
                line.setAttribute("y2", String(to.y - NODE_H / 2));
                line.setAttribute("stroke", "#3a3a5a");
                line.setAttribute("stroke-width", "1.5");
                line.setAttribute("marker-end", "url(#arr)");
                svg.appendChild(line);
            }
        }

        // Node groups
        for (const node of nodes) {
            const { x, y } = pos.get(node.id)!;
            const rx = x - NODE_W / 2, ry = y - NODE_H / 2;

            const g = document.createElementNS(ns, "g");
            g.setAttribute("id", `ng-${node.id}`);

            const rect = document.createElementNS(ns, "rect");
            rect.setAttribute("id",           `nr-${node.id}`);
            rect.setAttribute("x",            String(rx));
            rect.setAttribute("y",            String(ry));
            rect.setAttribute("width",        String(NODE_W));
            rect.setAttribute("height",       String(NODE_H));
            rect.setAttribute("rx",           "5");
            rect.setAttribute("fill",         "#1a1a28");
            rect.setAttribute("stroke",       node.id === this.graph!.entry ? "#f59e0b" : "#2e2e46");
            rect.setAttribute("stroke-width", node.id === this.graph!.entry ? "2" : "1");

            const lbl = document.createElementNS(ns, "text");
            lbl.setAttribute("x",           String(x));
            lbl.setAttribute("y",           String(ry + 17));
            lbl.setAttribute("text-anchor", "middle");
            lbl.setAttribute("fill",        "#d0d0e8");
            lbl.setAttribute("font-size",   "10");
            lbl.setAttribute("font-family", "JetBrains Mono, monospace");
            lbl.setAttribute("font-weight", "600");
            lbl.textContent = node.id;

            const badge = document.createElementNS(ns, "text");
            badge.setAttribute("id",           `nb-${node.id}`);
            badge.setAttribute("x",            String(x));
            badge.setAttribute("y",            String(ry + 32));
            badge.setAttribute("text-anchor",  "middle");
            badge.setAttribute("fill",         STATE_COLOR["idle"]);
            badge.setAttribute("font-size",    "8");
            badge.setAttribute("font-family",  "JetBrains Mono, monospace");
            badge.setAttribute("font-weight",  "700");
            badge.textContent = STATE_LABEL["idle"];

            const src = document.createElementNS(ns, "text");
            src.setAttribute("x",           String(x));
            src.setAttribute("y",           String(ry + 45));
            src.setAttribute("text-anchor", "middle");
            src.setAttribute("fill",        "#3a3a5a");
            src.setAttribute("font-size",   "7");
            src.setAttribute("font-family", "JetBrains Mono, monospace");
            src.textContent = node.source.replace("videos/", "").replace(".mp4", "");

            g.append(rect, lbl, badge, src);
            svg.appendChild(g);
        }

        this.graphContainer.innerHTML = "";
        this.graphContainer.appendChild(svg);
    }

    private computeLayers(graph: TimelineGraph): Map<string, number> {
        const layers = new Map<string, number>();
        const queue  = [graph.entry];
        layers.set(graph.entry, 0);

        while (queue.length > 0) {
            const id   = queue.shift()!;
            const node = graph.nodes.get(id);
            if (!node) continue;
            for (const outId of node.outputs) {
                if (!layers.has(outId)) {
                    layers.set(outId, layers.get(id)! + 1);
                    queue.push(outId);
                }
            }
        }

        for (const id of graph.nodes.keys()) {
            if (!layers.has(id)) layers.set(id, 0);
        }

        return layers;
    }

    private updateNodeBadge(nodeId: string, state: string): void {
        const badge = document.getElementById(`nb-${nodeId}`);
        const rect  = document.getElementById(`nr-${nodeId}`);
        if (!badge || !rect) return;

        badge.setAttribute("fill",      STATE_COLOR[state] ?? "#555");
        badge.textContent = STATE_LABEL[state] ?? state.toUpperCase();

        rect.setAttribute("stroke",
            state === "playing" ? "#22c55e" :
                state === "warm"    ? "#f59e0b" : "#2e2e46");
        rect.setAttribute("stroke-width",
            (state === "playing" || state === "warm") ? "2" : "1");
    }

    // -----------------------------------------------------------------------
    // Event log
    // -----------------------------------------------------------------------

    log(type: "system" | "decoder" | "choice", html: string): void {
        const row = document.createElement("div");
        row.className = `dbg-log-entry dbg-log-${type}`;
        const ts = new Date().toISOString().slice(11, 23);
        row.innerHTML = `<span class="dbg-ts">${ts}</span>${html}`;
        this.logContainer.prepend(row);
        while (this.logContainer.children.length > 300) {
            this.logContainer.lastChild?.remove();
        }
    }

    // -----------------------------------------------------------------------
    // Decoder event subscription
    // -----------------------------------------------------------------------

    private subscribeToDecoderEvents(): void {
        const METHOD_STATE: Record<string, string> = {
            load:    "loaded",
            demux:   "demuxed",
            warm:    "warm",
            play:    "playing",
            pause:   "warm",
            dispose: "idle",
        };
        const ICONS: Record<string, string> = {
            load:    "📥", demux: "📦", warm: "🔥",
            play:    "▶️",  pause: "⏸",  dispose: "🗑",
        };

        onDecoderEvent(event => {
            if (event.kind === "tick") return; // too noisy for the log

            if (event.kind === "ended") {
                const nodeId = sourceToNodeId.get(event.source) ?? event.source;
                this.log("system", `⏹ <b>${nodeId}</b> ended`);
                return;
            }

            if (event.kind === "lifecycle" && event.phase === "end") {
                const nodeId = sourceToNodeId.get(event.source) ?? event.source;
                const state  = METHOD_STATE[event.method];
                if (state) this.updateNodeBadge(nodeId, state);

                const arrow = "✓";
                this.log(
                    "decoder",
                    `${ICONS[event.method] ?? "·"} <b>${nodeId}</b> ${arrow} ${event.method}`,
                );
            }
        });
    }
}