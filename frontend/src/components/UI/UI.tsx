// src/test/DebugUI.tsx
import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import type { Application } from "../../app/Application";
import type { TimelineGraph } from "../../timeline/types";
import { onDecoderEvent } from "../../test/MockDecoder";
import { MockVideoPlayer } from "../../test/MockVideoPlayer";
import { GraphEditor } from "../GraphEditor";
import { EventLog } from "../EventLog";
import type {LogEntry} from "../EventLog";
import styles from "./UI.module.css";

export interface DebugUIRef {
    onGraphLoaded: (graph: TimelineGraph) => void;
}

interface DebugUIProps {
    app: Application;
}

export const UI = forwardRef<DebugUIRef, DebugUIProps>(({ app }, ref) => {
    const [graph, setGraph] = useState<TimelineGraph | null>(null);
    const [playingNodeId, setPlayingNodeId] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<MockVideoPlayer | null>(null);
    const sourceToNodeIdRef = useRef<Map<string, string>>(new Map());

    const addLog = useCallback((type: "system" | "decoder" | "choice", html: string) => {
        const ts = new Date().toISOString().slice(11, 23);
        const newEntry: LogEntry = {
            id: Math.random().toString(36).substring(2, 9),
            type,
            timestamp: ts,
            html
        };
        setLogs(prev => [newEntry, ...prev].slice(0, 300));
    }, []);

    const previewNode = useCallback(async (nodeId: string, currentGraph: TimelineGraph | null) => {
        if (!currentGraph) return;
        const node = currentGraph.nodes.get(nodeId);
        if (!node) return;

        try {
            await app.previewNode(nodeId);
        } catch (e) {
            addLog("system", `⚠ previewNode failed: ${e}`);
            return;
        }

        if (playerRef.current) {
            playerRef.current.setGraph(currentGraph);
            playerRef.current.notifyNodeChanged(node.id, node.source);
        }
        setPlayingNodeId(nodeId);
    }, [app, addLog]);

    useImperativeHandle(ref, () => ({
        onGraphLoaded: (loadedGraph: TimelineGraph) => {
            setGraph(loadedGraph);

            sourceToNodeIdRef.current.clear();
            for (const node of loadedGraph.nodes.values()) {
                sourceToNodeIdRef.current.set(node.source, node.id);
            }

            if (playerRef.current) {
                playerRef.current.setGraph(loadedGraph);
            }

            addLog("system", `Graph loaded · entry <b>${loadedGraph.entry}</b> · ${loadedGraph.nodes.size} nodes`);
            previewNode(loadedGraph.entry, loadedGraph).then();
        }
    }), [addLog, previewNode]);

    useEffect(() => {
        if (!playerContainerRef.current) return;

        const player = new MockVideoPlayer(playerContainerRef.current);
        playerRef.current = player;

        player.setChoiceCallback(async (nodeId) => {
            addLog("choice", `▶ chose <b>${nodeId}</b>`);
            await app.choose(nodeId);

            setGraph(currentGraph => {
                const node = currentGraph?.nodes.get(nodeId);
                if (node && playerRef.current) {
                    playerRef.current.notifyNodeChanged(node.id, node.source);
                }
                return currentGraph;
            });

            setPlayingNodeId(nodeId);
        });

        return () => {
            if (player && typeof (player as any).destroy === 'function') {
                (player as any).destroy();
            }
            if (playerContainerRef.current) {
                playerContainerRef.current.innerHTML = "";
            }
        };
    }, [app, addLog]);

    useEffect(() => {
        const ICONS: Record<string, string> = {
            load: "📥", demux: "📦", warm: "🔥", play: "▶️", pause: "⏸", dispose: "🗑",
        };

        const unsubscribe = onDecoderEvent(event => {
            if (event.kind === "tick") return;

            const nodeId = sourceToNodeIdRef.current.get(event.source) ?? event.source;

            if (event.kind === "ended") {
                addLog("system", `⏹ <b>${nodeId}</b> ended`);
                return;
            }
            if (event.kind === "lifecycle" && event.phase === "end") {
                addLog("decoder", `${ICONS[event.method] ?? "·"} <b>${nodeId}</b> ✓ ${event.method}`);
            }
        });

        return () => unsubscribe();
    }, [addLog]);

    const handleGraphChange = useCallback((updatedGraph: TimelineGraph) => {
        sourceToNodeIdRef.current.clear();
        for (const node of updatedGraph.nodes.values()) {
            sourceToNodeIdRef.current.set(node.source, node.id);
        }

        if (playerRef.current) {
            playerRef.current.setGraph(updatedGraph);
        }
        setGraph(updatedGraph);
        addLog("system", `Graph edited · ${updatedGraph.nodes.size} nodes`);
    }, [addLog]);

    const handlePreviewRequest = useCallback(async (nodeId: string) => {
        addLog("choice", `▶ preview <b>${nodeId}</b> (from start)`);
        await previewNode(nodeId, graph);
    }, [graph, previewNode, addLog]);

    return (
        <div className={styles.layout}>
            <aside className={styles.leftCol}>
                <div className={styles.panelTitle}>
                    <span>Graph Editor</span>
                    <span style={{ fontSize: 8, color: "#30305a", letterSpacing: 1 }}>CANVAS · INTERACTIVE</span>
                </div>
                <GraphEditor
                    graph={graph}
                    playingId={playingNodeId}
                    onPreview={handlePreviewRequest}
                    onGraphChange={handleGraphChange}
                />
            </aside>

            <div className={styles.centreCol}>
                <div className={styles.panelTitle}>
                    {playingNodeId ? `▶  ${playingNodeId}` : "Player"}
                </div>
                <div ref={playerContainerRef} style={{ flex: 1, position: "relative" }} />
            </div>

            <EventLog entries={logs} />
        </div>
    );
});

UI.displayName = "DebugUI";