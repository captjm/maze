import React, {useCallback, useEffect, useRef, useState} from "react";
import type {TimelineGraph, TimelineNode} from "../../timeline/types";
import {NodePropertyPanel} from "./NodePropertyPanel.tsx";
import {GraphRenderer} from "./GraphRenderer";
import {useGraphLayout} from "./useGraphLayout";
import {useGraphEvents} from "./useGraphEvents";
import {GraphLoader} from "../../timeline/GraphLoader";
import styles from "./GraphEditor.module.css";
import clsx from "clsx";

interface GraphEditorProps {
    graph: TimelineGraph | null;
    playingId: string | null;
    onPreview: (nodeId: string) => Promise<void>;
    onGraphChange: (graph: TimelineGraph) => void;
}

export const GraphEditor: React.FC<GraphEditorProps> = ({graph, playingId, onPreview, onGraphChange}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [scale, setScale] = useState(1);

    const [renderTrigger, setRenderTrigger] = useState(0);

    const triggerRender = useCallback(() => setRenderTrigger((p) => p + 1), []);

    const {layout, setLayout} = useGraphLayout(graph);

    const fitView = useCallback(() => {
        if (!wrapRef.current || layout.size === 0) return;
        const rect = wrapRef.current.getBoundingClientRect();

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of layout.values()) {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x;
            if (n.y > maxY) maxY = n.y;
        }

        const padding = 60;
        const gw = (maxX - minX) + 148;
        const gh = (maxY - minY) + 60;

        const scX = (rect.width - padding * 2) / gw;
        const scY = (rect.height - padding * 2) / gh;
        const nextSc = Math.max(0.3, Math.min(1.2, Math.min(scX, scY)));

        const cx = minX + gw / 2;
        const cy = minY + gh / 2;

        const eventsState = events.stateRef.current;
        eventsState.sc = nextSc;
        eventsState.px = rect.width / 2 - cx * nextSc;
        eventsState.py = rect.height / 2 - cy * nextSc;

        setScale(nextSc);
        triggerRender();
    }, [layout, triggerRender]);

    const events = useGraphEvents({
        canvasRef, layout, setLayout, graph, setSelectedId, onGraphChange, fitView, triggerRender, setScale,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space") events.stateRef.current.spaceDown = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") events.stateRef.current.spaceDown = false;
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [events]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = wrap.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const s = events.stateRef.current;

        s.edgeBadges = GraphRenderer.render({
            ctx, width: rect.width, height: rect.height,
            px: s.px, py: s.py, sc: s.sc,
            layout, graph, playingId, selectedId, drawingEdge: s.drawingEdge,
        });
    }, [layout, graph, playingId, selectedId, renderTrigger, events]);

    const applyNodeChanges = (oldId: string, updated: TimelineNode) => {
        if (!graph || !updated.id) return;

        const node = graph.nodes.get(oldId);
        if (!node) return;

        if (updated.id !== oldId) {
            graph.nodes.delete(oldId);
            graph.nodes.set(updated.id, updated);

            for (const n of graph.nodes.values()) {
                n.outputs = n.outputs.map((o) => (o === oldId ? updated.id : o));
            }

            if (graph.entry === oldId) {
                graph.entry = updated.id;
            }

            const lay = events.stateRef.current.layout.get(oldId);
            if (lay) {
                lay.id = updated.id;
                events.stateRef.current.layout.delete(oldId);
                events.stateRef.current.layout.set(updated.id, lay);
            }

            setSelectedId(updated.id);
        } else {
            node.source = updated.source;
        }

        onGraphChange({...graph});
    };

    const deleteNode = (id: string) => {
        if (!graph) return;
        graph.nodes.delete(id);
        for (const n of graph.nodes.values()) {
            n.outputs = n.outputs.filter((o) => o !== id);
        }
        if (graph.entry === id) {
            const first = Array.from(graph.nodes.keys())[0];
            graph.entry = first || "";
        }
        setSelectedId(null);
        onGraphChange({...graph});
    };

    const setAsEntry = (id: string) => {
        if (!graph) return;
        graph.entry = id;
        onGraphChange({...graph});
    };

    const addNewNode = () => {
        if (!graph) return;
        let id = "node_new";
        let c = 1;
        while (graph.nodes.has(id)) {
            id = `node_new_${c++}`;
        }
        const newNode: TimelineNode = {id, source: "", outputs: []};
        graph.nodes.set(id, newNode);
        onGraphChange({...graph});
    };

    const exportJson = () => {
        if (!graph) return;
        const fileObj = GraphLoader.toJson(graph);
        const blob = new Blob([JSON.stringify(fileObj, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "timeline-graph.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    const selectedNode = graph && selectedId ? graph.nodes.get(selectedId) : null;

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <button onClick={addNewNode} className={styles.tbBtn}>+ Node</button>
                <button onClick={fitView} className={clsx(styles.tbBtn, styles.tbBtnBlue)}>⊡ Fit</button>
                <button onClick={exportJson} className={clsx(styles.tbBtn, styles.tbBtnYellow)}>↓ JSON</button>
                <span className={styles.toolBarInfo}>
                    drag node · port → node for edge · double click to open property panel
                </span>
            </div>

            <div ref={wrapRef} className={styles.wrapper}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={events.handleMouseDown}
                    onMouseMove={events.handleMouseMove}
                    onMouseUp={events.handleMouseUp}
                    onWheel={events.handleWheel}
                    onDoubleClick={events.handleDoubleClick}
                    className={clsx(styles.canvas, events.stateRef.current.spaceDown ? styles.cursorGrab : null)}
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
};