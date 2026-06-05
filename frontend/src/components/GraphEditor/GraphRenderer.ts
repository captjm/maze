import {NH, NR, NW, PORT_R, STATE_COLOR, STATE_LABEL} from "./constants";
import {accent, nodeBg} from "./helpers";
import type {TimelineGraph} from "../../timeline/types";

export interface NL {
    id: string;
    x: number;
    y: number;
    state: string;
}

export interface BadgeInfo {
    fromId: string;
    edgeIdx: number;
    mx: number;
    my: number;
}

interface RenderOptions {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    px: number;
    py: number;
    sc: number;
    layout: Map<string, NL>;
    graph: TimelineGraph | null;
    playingId: string | null;
    selectedId: string | null;
    drawingEdge: { fromId: string; x: number; y: number } | null;
}

export class GraphRenderer {
    public static render(opts: RenderOptions): BadgeInfo[] {
        const {ctx, width, height, px, py, sc, layout, graph, playingId, selectedId, drawingEdge} = opts;
        const edgeBadges: BadgeInfo[] = [];

        ctx.fillStyle = "#10101c";
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(sc, sc);

        this.drawGrid(ctx, width, height, px, py, sc);

        if (graph) {
            for (const node of graph.nodes.values()) {
                const srcView = layout.get(node.id);
                if (!srcView) continue;

                const outPortX = srcView.x + NW;
                const outPortY = srcView.y + NH / 2;

                node.outputs.forEach((targetId, edgeIdx) => {
                    const tgtView = layout.get(targetId);
                    if (!tgtView) return;

                    const inPortX = tgtView.x;
                    const inPortY = tgtView.y + NH / 2;

                    const dx = Math.abs(inPortX - outPortX) * 0.5;
                    const cp1x = outPortX + dx;
                    const cp1y = outPortY;
                    const cp2x = inPortX - dx;
                    const cp2y = inPortY;

                    ctx.beginPath();
                    ctx.moveTo(outPortX, outPortY);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, inPortX, inPortY);

                    const isCurrentPath = playingId === node.id && graph.nodes.get(playingId)?.outputs[edgeIdx] === targetId;
                    ctx.strokeStyle = isCurrentPath ? "#22c55e" : "#2a2a40";
                    ctx.lineWidth = isCurrentPath ? 3 : 2;
                    ctx.stroke();

                    const t = 0.5;
                    const mx = (1 - t) ** 3 * outPortX + 3 * (1 - t) ** 2 * t * cp1x + 3 * (1 - t) * t ** 2 * cp2x + t ** 3 * inPortX;
                    const my = (1 - t) ** 3 * outPortY + 3 * (1 - t) ** 2 * t * cp1y + 3 * (1 - t) * t ** 2 * cp2y + t ** 3 * inPortY;

                    const bx = mx - 7;
                    const by = my - 7;
                    edgeBadges.push({fromId: node.id, edgeIdx, mx: bx, my: by});

                    ctx.fillStyle = "#161622";
                    ctx.strokeStyle = "#2a2a40";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.rect(bx, by, 14, 14);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = "#50507a";
                    ctx.font = "bold 10px monospace";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("×", bx + 7, by + 7);
                });
            }

            if (drawingEdge) {
                const srcView = layout.get(drawingEdge.fromId);
                if (srcView) {
                    const outX = srcView.x + NW;
                    const outY = srcView.y + NH / 2;
                    ctx.beginPath();
                    ctx.moveTo(outX, outY);
                    const dx = Math.abs(drawingEdge.x - outX) * 0.5;
                    ctx.bezierCurveTo(outX + dx, outY, drawingEdge.x - dx, drawingEdge.y, drawingEdge.x, drawingEdge.y);
                    ctx.strokeStyle = "#f59e0b";
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }

        for (const node of layout.values()) {
            const isPlaying = node.id === playingId;
            const isSelected = node.id === selectedId;
            const isEntry = graph?.entry === node.id;
            this.drawNode(ctx, node, isPlaying, isSelected, isEntry);
        }

        ctx.restore();
        return edgeBadges;
    }

    private static drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, px: number, py: number, sc: number) {
        const size = 32;
        const startX = -px / sc;
        const startY = -py / sc;
        const endX = startX + w / sc;
        const endY = startY + h / sc;

        ctx.strokeStyle = "rgba(40, 40, 65, 0.25)";
        ctx.lineWidth = 1;

        const left = Math.floor(startX / size) * size;
        const top = Math.floor(startY / size) * size;

        ctx.beginPath();
        for (let x = left; x <= endX; x += size) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = top; y <= endY; y += size) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    private static drawNode(ctx: CanvasRenderingContext2D, node: NL, isPlaying: boolean, isSelected: boolean, isEntry: boolean) {
        ctx.fillStyle = nodeBg(node.state);
        ctx.beginPath();
        this.roundRect(ctx, node.x, node.y, NW, NH, NR);
        ctx.fill();

        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeStyle = isSelected ? "#3b82f6" : isPlaying ? "#22c55e" : "#1e1e30";
        ctx.stroke();

        if (isEntry) {
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(node.x + 12, node.y + 16, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = isPlaying ? "#fff" : "#c0c0d8";
        ctx.font = "bold 12px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(node.id, isEntry ? node.x + 24 : node.x + 12, node.y + 10);

        const stColor = STATE_COLOR[node.state] || "#3a3a4a";
        const stLabel = STATE_LABEL[node.state] || "IDLE";

        ctx.fillStyle = stColor;
        ctx.beginPath();
        this.roundRect(ctx, node.x + 12, node.y + 32, 54, 16, 3);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(stLabel, node.x + 12 + 27, node.y + 32 + 8);

        const pX = node.x + NW;
        const pY = node.y + NH / 2;
        ctx.fillStyle = "#10101c";
        ctx.strokeStyle = isSelected ? "#3b82f6" : "#1e1e30";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pX, pY, PORT_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = accent(node.state);
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("▶", pX, pY);
    }

    private static roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}