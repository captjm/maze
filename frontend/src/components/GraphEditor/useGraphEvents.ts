import React, {useRef} from "react";
import type {TimelineGraph} from "../../timeline/types";
import {NH, NW, PORT_R} from "./constants";
import type {BadgeInfo, NL} from "./GraphRenderer";

interface EventHookProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    layout: Map<string, NL>;
    setLayout: React.Dispatch<React.SetStateAction<Map<string, NL>>>;
    graph: TimelineGraph | null;
    setSelectedId: (id: string | null) => void;
    onGraphChange: (graph: TimelineGraph) => void;
    fitView: () => void;
    triggerRender: () => void;
    setScale: (sc: number) => void;
}

export const useGraphEvents = (props: EventHookProps) => {
    const {canvasRef, layout, setLayout, graph, setSelectedId, onGraphChange, fitView, triggerRender, setScale} = props;

    const stateRef = useRef({
        layout: new Map<string, NL>(),
        px: 0, py: 20, sc: 1,
        draggingNode: null as { id: string; ox: number; oy: number } | null,
        panning: null as { sx: number; sy: number; px0: number; py0: number } | null,
        edgeBadges: [] as BadgeInfo[],
        drawingEdge: null as { fromId: string; x: number; y: number } | null,
        spaceDown: false,
    });

    stateRef.current.layout = layout;

    const toWorld = (clientX: number, clientY: number): [number, number] => {
        const s = stateRef.current;
        return [(clientX - s.px) / s.sc, (clientY - s.py) / s.sc];
    };

    const findNodeAt = (mx: number, my: number): NL | null => {
        for (const node of stateRef.current.layout.values()) {
            if (mx >= node.x && mx <= node.x + NW && my >= node.y && my <= node.y + NH) return node;
        }
        return null;
    };

    const removeEdge = (fromId: string, edgeIdx: number) => {
        if (!graph) return;
        const fromNode = graph.nodes.get(fromId);
        if (fromNode && fromNode.outputs) {
            const arr = [...fromNode.outputs];
            arr.splice(edgeIdx, 1);
            fromNode.outputs = arr;
            onGraphChange({...graph});
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const s = stateRef.current;

        if (s.spaceDown || e.button === 1) {
            s.panning = {sx: clientX, sy: clientY, px0: s.px, py0: s.py};
            return;
        }

        const [mx, my] = toWorld(clientX, clientY);

        for (const badge of s.edgeBadges) {
            if (mx >= badge.mx && mx <= badge.mx + 14 && my >= badge.my && my <= badge.my + 14) {
                removeEdge(badge.fromId, badge.edgeIdx);
                return;
            }
        }

        const node = findNodeAt(mx, my);
        if (node) {
            const pX = node.x + NW;
            const pY = node.y + NH / 2;
            if (Math.hypot(mx - pX, my - pY) <= PORT_R + 5) {
                s.drawingEdge = {fromId: node.id, x: mx, y: my};
            } else {
                s.draggingNode = {id: node.id, ox: mx - node.x, oy: my - node.y};
            }
        } else {
            setSelectedId(null);
        }
        triggerRender();
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const s = stateRef.current;

        if (s.panning) {
            s.px = s.panning.px0 + (clientX - s.panning.sx);
            s.py = s.panning.py0 + (clientY - s.panning.sy);
            triggerRender();
            return;
        }

        const [mx, my] = toWorld(clientX, clientY);

        if (s.draggingNode) {
            const targetId = s.draggingNode.id;
            const nx = mx - s.draggingNode.ox;
            const ny = my - s.draggingNode.oy;

            setLayout((prev) => {
                const next = new Map(prev);
                const item = next.get(targetId);
                if (item) next.set(targetId, {...item, x: nx, y: ny});
                return next;
            });
        } else if (s.drawingEdge) {
            s.drawingEdge.x = mx;
            s.drawingEdge.y = my;
            triggerRender();
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const s = stateRef.current;
        s.panning = null;

        if (s.draggingNode) {
            s.draggingNode = null;
        } else if (s.drawingEdge && graph) {
            if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                const [mx, my] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
                const targetNode = findNodeAt(mx, my);

                if (targetNode && targetNode.id !== s.drawingEdge.fromId) {
                    const srcNode = graph.nodes.get(s.drawingEdge.fromId);
                    if (srcNode && !srcNode.outputs.includes(targetNode.id)) {
                        srcNode.outputs = [...srcNode.outputs, targetNode.id];
                        onGraphChange({...graph});
                    }
                }
            }
            s.drawingEdge = null;
            triggerRender();
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const s = stateRef.current;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nextScale = Math.max(0.15, Math.min(4, s.sc * zoomFactor));

        s.px = cx - (cx - s.px) * (nextScale / s.sc);
        s.py = cy - (cy - s.py) * (nextScale / s.sc);
        s.sc = nextScale;

        setScale(nextScale);
        triggerRender();
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const [mx, my] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const node = findNodeAt(mx, my);

        if (node) {
            setSelectedId(node.id);
        } else {
            fitView();
        }
    };

    return {stateRef, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleDoubleClick};
};