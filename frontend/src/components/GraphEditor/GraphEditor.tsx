import React, {useEffect, useRef, useState} from "react";
import type {TimelineGraph, TimelineNode} from "../../timeline/types";
import {onDecoderEvent} from "../../test/MockDecoder";
import { NW, NH, NR, STATE_COLOR, STATE_LABEL, PORT_R } from "./constants.ts";
import {NodePropertyPanel} from "./NodePropertyPanel.tsx";
import styles from "./GraphEditor.module.css";
import {accent, nodeBg} from "./helpers.ts";
import clsx from "clsx";

interface NL {
    id: string;
    x: number;
    y: number;
    state: string;
}

interface GraphEditorProps {
    graph: TimelineGraph | null;
    playingId: string | null;
    onPreview: (nodeId: string) => Promise<void>;
    onGraphChange: (graph: TimelineGraph) => void;
}

export const GraphEditor = (
    {graph, playingId, onPreview, onGraphChange} : GraphEditorProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [scale, setScale] = useState(1);

    const stateRef = useRef({
        layout: new Map<string, NL>(),
        px: 0, py: 20, sc: 1,
        draggingNode: null as { id: string; ox: number; oy: number } | null,
        panning: null as { sx: number; sy: number; px0: number; py0: number } | null,
        spaceDown: false,
        hoveredId: null as string | null,
        edgeDraw: null as { fromId: string; mx: number; my: number } | null,
        srcToId: new Map<string, string>(),
        newNodeCounter: 1,
        edgeBadges: [] as Array<{ fromId: string; edgeIdx: number; mx: number; my: number }>,
    });

    const selectedNode = graph?.nodes.get(selectedId || "");

    useEffect(() => {
        if (!graph) return;
        const s = stateRef.current;
        s.srcToId.clear();
        s.layout.clear();
        for (const n of graph.nodes.values()) s.srcToId.set(n.source, n.id);

        // BFS LAYOUT
        const layers = new Map<string, number>();
        const queue = [graph.entry];
        layers.set(graph.entry, 0);
        while (queue.length) {
            const id = queue.shift()!;
            const node = graph.nodes.get(id);
            if (!node) continue;
            for (const o of node.outputs) {
                if (!layers.has(o)) {
                    layers.set(o, layers.get(id)! + 1);
                    queue.push(o);
                }
            }
        }
        for (const id of graph.nodes.keys()) if (!layers.has(id)) layers.set(id, 0);

        const byLayer = new Map<number, string[]>();
        for (const [id, l] of layers) {
            if (!byLayer.has(l)) byLayer.set(l, []);
            byLayer.get(l)!.push(id);
        }
        const XGAP = NW + 56, YGAP = NH + 56, PAD = 40;
        for (const [layer, ids] of byLayer) {
            ids.forEach((id, i) => {
                s.layout.set(id, {
                    id, state: "idle",
                    x: PAD + i * XGAP + NW / 2,
                    y: PAD + layer * YGAP + NH / 2,
                });
            });
        }

        const allX = [...s.layout.values()].map(n => n.x);
        const W = canvasRef.current?.clientWidth || 300;
        const graphW = Math.max(...allX) - Math.min(...allX) + NW;
        const shift = (W - graphW) / 2 - Math.min(...allX) + NW / 2;
        for (const n of s.layout.values()) n.x += shift;

        s.px = 0;
        s.py = 20;
        s.sc = 1;
        setScale(1);
        setSelectedId(null);
    }, [graph]);

    useEffect(() => {
        const M: Record<string, string> = {
            load: "loaded", demux: "demuxed", warm: "warm", play: "playing", pause: "warm", dispose: "idle",
        };
        const unsubscribe = onDecoderEvent(ev => {
            if (ev.kind === "lifecycle" && ev.phase === "end") {
                const id = stateRef.current.srcToId.get(ev.source);
                if (!id) return;
                const nodeState = M[ev.method];
                const n = stateRef.current.layout.get(id);
                if (n && nodeState) n.state = nodeState;
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        let animId: number;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;

        const render = () => {
            const s = stateRef.current;
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.width;
            const H = canvas.height;

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = "#0b0b12";
            ctx.fillRect(0, 0, W, H);

            const gridSp = 28 * dpr * s.sc;
            const ox = (s.px * dpr) % gridSp, oy = (s.py * dpr) % gridSp;
            ctx.fillStyle = "rgba(255,255,255,0.022)";
            for (let x = ox; x < W; x += gridSp) {
                for (let y = oy; y < H; y += gridSp) {
                    ctx.fillRect(x - dpr * 0.5, y - dpr * 0.5, dpr, dpr);
                }
            }

            if (!graph || !s.layout.size) {
                ctx.fillStyle = "#1e1e2a";
                ctx.font = `bold ${13 * dpr}px "JetBrains Mono",monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("Load a graph to start editing", W / 2, H / 2);
                animId = requestAnimationFrame(render);
                return;
            }

            ctx.save();
            ctx.translate(s.px * dpr, s.py * dpr);
            ctx.scale(s.sc * dpr, s.sc * dpr);

            s.edgeBadges = [];
            const t = performance.now() / 1000;
            for (const node of graph.nodes.values()) {
                const fromNode = s.layout.get(node.id);
                if (!fromNode) continue;
                node.outputs.forEach((outId, ei) => {
                    const toNode = s.layout.get(outId);
                    if (!toNode) return;
                    const active = fromNode.state === "playing" || fromNode.state === "warm" || toNode.state === "playing" || toNode.state === "warm";

                    const x1 = fromNode.x + NW / 2, y1 = fromNode.y;
                    const x2 = toNode.x - NW / 2, y2 = toNode.y;
                    const dx = x2 - x1;
                    const cp1x = x1 + Math.max(dx * 0.5, 50), cp1y = y1;
                    const cp2x = x2 - Math.max(dx * 0.5, 50), cp2y = y2;

                    if (active) {
                        ctx.save();
                        ctx.shadowColor = "#f59e0b";
                        ctx.shadowBlur = 8;
                    }
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
                    ctx.strokeStyle = active ? "rgba(245,158,11,0.65)" : "rgba(70,70,110,0.55)";
                    ctx.lineWidth = active ? 2 : 1.5;
                    ctx.stroke();
                    if (active) ctx.restore();

                    if (active) {
                        for (let i = 0; i < 3; i++) {
                            const ph = ((t * 0.65 + i / 3) % 1);
                            const bezX = (1 - ph) ** 3 * x1 + 3 * (1 - ph) ** 2 * ph * cp1x + 3 * (1 - ph) * ph ** 2 * cp2x + ph ** 3 * x2;
                            const bezY = (1 - ph) ** 3 * y1 + 3 * (1 - ph) ** 2 * ph * cp1y + 3 * (1 - ph) * ph ** 2 * cp2y + ph ** 3 * y2;
                            ctx.beginPath();
                            ctx.arc(bezX, bezY, 2.5, 0, Math.PI * 2);
                            ctx.fillStyle = `rgba(245,158,11,${0.8 - ph * 0.4})`;
                            ctx.fill();
                        }
                    }

                    const angle = Math.atan2(y2 - cp2y, x2 - cp2x), arrS = 7;
                    ctx.save();
                    ctx.translate(x2, y2);
                    ctx.rotate(angle);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-arrS, -arrS * 0.5);
                    ctx.lineTo(-arrS, arrS * 0.5);
                    ctx.closePath();
                    ctx.fillStyle = active ? "rgba(245,158,11,0.75)" : "rgba(70,70,110,0.65)";
                    ctx.fill();
                    ctx.restore();

                    const mx = (1 - 0.5) ** 3 * x1 + 3 * (1 - 0.5) ** 2 * 0.5 * cp1x + 3 * (1 - 0.5) * 0.5 ** 2 * cp2x + 0.5 ** 3 * x2;
                    const my = (1 - 0.5) ** 3 * y1 + 3 * (1 - 0.5) ** 2 * 0.5 * cp1y + 3 * (1 - 0.5) * 0.5 ** 2 * cp2y + 0.5 ** 3 * y2;
                    ctx.save();
                    ctx.fillStyle = "rgba(239,68,68,0.8)";
                    ctx.beginPath();
                    ctx.arc(mx, my, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 8px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("×", mx, my + 0.5);
                    ctx.restore();

                    s.edgeBadges.push({fromId: node.id, edgeIdx: ei, mx, my});
                });
            }

            for (const n of s.layout.values()) {
                const x = n.x - NW / 2, y = n.y - NH / 2;
                const isPlaying = n.id === playingId;
                const isSelected = n.id === selectedId;
                const isHovered = n.id === s.hoveredId;
                const ac = accent(n.id);
                const sc = STATE_COLOR[n.state] ?? "#3a3a4a";

                if (isSelected) {
                    ctx.save();
                    ctx.shadowColor = ac;
                    ctx.shadowBlur = 14;
                    ctx.strokeStyle = ac;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(x - 4, y - 4, NW + 8, NH + 8, NR + 3);
                    ctx.stroke();
                    ctx.restore();
                }
                if (isPlaying) {
                    const pulse = (Math.sin(performance.now() / 300) + 1) / 2;
                    ctx.save();
                    ctx.shadowColor = "#22c55e";
                    ctx.shadowBlur = 18;
                    ctx.strokeStyle = `rgba(34,197,94,${0.5 + pulse * 0.5})`;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.roundRect(x - 5, y - 5, NW + 10, NH + 10, NR + 4);
                    ctx.stroke();
                    ctx.restore();
                }

                ctx.fillStyle = nodeBg(n.id);
                ctx.beginPath();
                ctx.roundRect(x, y, NW, NH, NR);
                ctx.fill();

                const bc = isPlaying ? "#22c55e" : isSelected ? ac : (graph.entry === n.id ? "#f59e0b" : (isHovered ? ac + "99" : "#252535"));
                ctx.strokeStyle = bc;
                ctx.lineWidth = isPlaying || isSelected ? 2 : 1.2;
                ctx.beginPath();
                ctx.roundRect(x, y, NW, NH, NR);
                ctx.stroke();

                ctx.fillStyle = sc;
                ctx.beginPath();
                ctx.roundRect(x, y, 4, NH, [NR, 0, 0, NR]);
                ctx.fill();

                ctx.fillStyle = isHovered || isSelected ? "#fff" : "#d0d0e8";
                ctx.font = `600 11px "JetBrains Mono",monospace`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(n.id, x + 12, y + NH * 0.36, NW - 20);

                ctx.fillStyle = sc;
                ctx.font = `700 7.5px "JetBrains Mono",monospace`;
                ctx.fillText(STATE_LABEL[n.state] ?? n.state.toUpperCase(), x + 12, y + NH * 0.70);

                if (graph.entry === n.id) {
                    ctx.fillStyle = "#f59e0b";
                    ctx.font = `700 7px "JetBrains Mono",monospace`;
                    ctx.textAlign = "right";
                    ctx.fillText("ENTRY", x + NW - 8, y + NH * 0.70);
                }

                const px = n.x + NW / 2, py = n.y;
                const portHover = s.hoveredId === n.id;
                ctx.beginPath();
                ctx.arc(px, py, PORT_R, 0, Math.PI * 2);
                ctx.fillStyle = portHover ? "#22c55e" : "#1a1a2e";
                ctx.strokeStyle = portHover ? "#22c55e" : "#333355";
                ctx.lineWidth = 1.5;
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = portHover ? "#fff" : "#555577";
                ctx.font = `bold 8px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("▶", px, py + 0.5);
            }

            if (s.edgeDraw) {
                const fromNode = s.layout.get(s.edgeDraw.fromId);
                if (fromNode) {
                    const [wx, wy] = [(s.edgeDraw.mx - s.px) / s.sc, (s.edgeDraw.my - s.py) / s.sc];
                    ctx.setLineDash([5, 4]);
                    ctx.beginPath();
                    ctx.moveTo(fromNode.x + NW / 2, fromNode.y);
                    ctx.lineTo(wx, wy);
                    ctx.strokeStyle = "#22c55e";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            ctx.restore();
            animId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animId);
    }, [graph, selectedId, playingId]);

    useEffect(() => {
        if (!wrapRef.current || !canvasRef.current) return;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const r = wrapRef.current!.getBoundingClientRect();
            if (canvasRef.current) {
                canvasRef.current.width = r.width * dpr;
                canvasRef.current.height = r.height * dpr;
            }
        };
        const ro = new ResizeObserver(resize);
        ro.observe(wrapRef.current);
        resize();
        return () => ro.disconnect();
    }, []);

    const getCoords = (e: React.MouseEvent<HTMLCanvasElement>): [number, number, number, number] => {
        const r = canvasRef.current!.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const s = stateRef.current;
        return [sx, sy, (sx - s.px) / s.sc, (sy - s.py) / s.sc];
    };

    const hitNodeTest = (wx: number, wy: number) => {
        for (const n of stateRef.current.layout.values()) {
            if (wx >= n.x - NW / 2 && wx <= n.x + NW / 2 && wy >= n.y - NH / 2 && wy <= n.y + NH / 2) return n.id;
        }
        return null;
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const [sx, sy, wx, wy] = getCoords(e);
        const s = stateRef.current;

        if (e.button === 1 || (e.button === 0 && s.spaceDown)) {
            s.panning = {sx, sy, px0: s.px, py0: s.py};
            return;
        }
        if (e.button !== 0) return;

        for (const n of s.layout.values()) {
            if (Math.hypot(wx - (n.x + NW / 2), wy - n.y) < PORT_R + 5) {
                s.edgeDraw = {fromId: n.id, mx: sx, my: sy};
                return;
            }
        }

        const hit = hitNodeTest(wx, wy);
        if (hit) {
            const n = s.layout.get(hit)!;
            s.draggingNode = {id: hit, ox: wx - n.x, oy: wy - n.y};
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const [sx, sy, wx, wy] = getCoords(e);
        const s = stateRef.current;

        if (s.panning) {
            s.px = s.panning.px0 + (sx - s.panning.sx);
            s.py = s.panning.py0 + (sy - s.panning.sy);
            return;
        }
        if (s.edgeDraw) {
            s.edgeDraw.mx = sx;
            s.edgeDraw.my = sy;
            return;
        }
        if (s.draggingNode) {
            const n = s.layout.get(s.draggingNode.id);
            if (n) {
                n.x = wx - s.draggingNode.ox;
                n.y = wy - s.draggingNode.oy;
            }
            return;
        }

        let hovered: string | null = null;
        for (const n of s.layout.values()) {
            if (Math.hypot(wx - (n.x + NW / 2), wy - n.y) < PORT_R + 5) {
                hovered = n.id;
                break;
            }
        }
        if (!hovered) hovered = hitNodeTest(wx, wy);
        s.hoveredId = hovered;
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const [, , wx, wy] = getCoords(e);
        const s = stateRef.current;

        if (s.edgeDraw) {
            const toId = hitNodeTest(wx, wy);
            if (toId && toId !== s.edgeDraw.fromId && graph) {
                const node = graph.nodes.get(s.edgeDraw.fromId);
                if (node && !node.outputs.includes(toId)) {
                    node.outputs.push(toId);
                    onGraphChange({...graph});
                }
            }
            s.edgeDraw = null;
            return;
        }

        for (const badge of s.edgeBadges) {
            if (Math.hypot(wx - badge.mx, wy - badge.my) < 8 && graph) {
                const node = graph.nodes.get(badge.fromId);
                if (node) {
                    node.outputs.splice(badge.edgeIdx, 1);
                    onGraphChange({...graph});
                    return;
                }
            }
        }

        const wasDragging = s.draggingNode;
        s.draggingNode = null;
        s.panning = null;

        if (!wasDragging && e.button === 0) {
            const hit = hitNodeTest(wx, wy);
            setSelectedId(hit);
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        const r = canvasRef.current!.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const s = stateRef.current;

        const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const ns = Math.min(4, Math.max(0.15, s.sc * f));
        s.px = sx - (sx - s.px) * (ns / s.sc);
        s.py = sy - (sy - s.py) * (ns / s.sc);
        s.sc = ns;
        setScale(ns);
    };

    const fitView = () => {
        const s = stateRef.current;
        if (!s.layout.size || !canvasRef.current) return;
        const xs = [...s.layout.values()].map(n => n.x);
        const ys = [...s.layout.values()].map(n => n.y);
        const minX = Math.min(...xs) - NW / 2 - 30;
        const minY = Math.min(...ys) - NH / 2 - 30;
        const maxX = Math.max(...xs) + NW / 2 + 30;
        const maxY = Math.max(...ys) + NH / 2 + 30;
        const W = canvasRef.current.clientWidth, H = canvasRef.current.clientHeight;
        const sx = W / (maxX - minX), sy = H / (maxY - minY);
        s.sc = Math.min(sx, sy, 2);
        s.px = (W - (maxX + minX) * s.sc) / 2;
        s.py = (H - (maxY + minY) * s.sc) / 2;
        setScale(s.sc);
    };

    const addNewNode = () => {
        if (!graph || !canvasRef.current) return;
        const s = stateRef.current;
        const id = `node_${s.newNodeCounter++}`;
        const node: TimelineNode = {id, source: `videos/${id}.mp4`, outputs: []};
        graph.nodes.set(id, node);

        const W = canvasRef.current.clientWidth, H = canvasRef.current.clientHeight;
        const cx = (W / 2 - s.px) / s.sc;
        const cy = (H / 2 - s.py) / s.sc;
        s.layout.set(id, {id, state: "idle", x: cx, y: cy});

        setSelectedId(id);
        onGraphChange({...graph});
    };

    const exportJson = () => {
        if (!graph) return;
        const file = {entry: graph.entry, nodes: [...graph.nodes.values()]};
        const blob = new Blob([JSON.stringify(file, null, 2)], {type: "application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "graph.json";
        a.click();
    };

    const applyNodeChanges = (oldId: string, newId: string, newSrc: string) => {
        if (!graph || !newId) return;
        const node = graph.nodes.get(oldId);
        if (!node) return;

        if (newId !== oldId) {
            const renamed: TimelineNode = {...node, id: newId, source: newSrc};
            graph.nodes.delete(oldId);
            graph.nodes.set(newId, renamed);

            for (const n of graph.nodes.values()) {
                const i = n.outputs.indexOf(oldId);
                if (i !== -1) n.outputs[i] = newId;
            }
            if (graph.entry === oldId) graph.entry = newId;

            const lay = stateRef.current.layout.get(oldId);
            if (lay) {
                lay.id = newId;
                stateRef.current.layout.delete(oldId);
                stateRef.current.layout.set(newId, lay);
            }
            setSelectedId(newId);
        } else {
            node.source = newSrc;
        }
        onGraphChange({...graph});
    };

    const deleteNode = (id: string) => {
        if (!graph) return;
        if (graph.entry === id) {
            alert("Cannot delete the entry node. Set another node as entry first.");
            return;
        }
        graph.nodes.delete(id);
        stateRef.current.layout.delete(id);
        for (const n of graph.nodes.values()) {
            n.outputs = n.outputs.filter(o => o !== id);
        }
        setSelectedId(null);
        onGraphChange({...graph});
    };

    const setAsEntry = (id: string) => {
        if (!graph) return;
        graph.entry = id;
        onGraphChange({...graph});
    };

    return (
        <div className={styles.editor}>
            <div
                className={styles.toolBar}>
                <button onClick={addNewNode} className={clsx(styles.tbBtn, styles.tbBtnGreen)}>+ Node</button>
                <button onClick={fitView} className={clsx(styles.tbBtn, styles.tbBtnBlue)}>⊡ Fit</button>
                <button onClick={exportJson} className={clsx(styles.tbBtn, styles.tbBtnYellow)}>↓ JSON</button>
                <span className={styles.toolBarInfo}>
                    drag node · port → node for edge · click to select
                </span>
            </div>

            <div ref={wrapRef} className={styles.wrapper}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    className={clsx(styles.canvas, stateRef.current.spaceDown ? styles.cursorGrab : null)}
                />
                <div className={styles.scale}>
                    {Math.round(scale * 100)}%
                </div>

                {graph && selectedNode && (
                    <NodePropertyPanel
                        node={selectedNode}
                        graph={graph}
                        onClose={() => setSelectedId(null)}
                        onSave={applyNodeChanges}
                        onDelete={deleteNode}
                        onSetEntry={setAsEntry}
                        onPreview={onPreview}
                        onGraphChange={onGraphChange}
                    />
                )}
            </div>
        </div>
    );
}