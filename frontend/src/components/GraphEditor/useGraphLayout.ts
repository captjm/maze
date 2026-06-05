import {useEffect, useRef, useState} from "react";
import type {TimelineGraph} from "../../timeline/types";
import {onDecoderEvent} from "../../test/MockDecoder";
import type {NL} from "./GraphRenderer";

export const useGraphLayout = (graph: TimelineGraph | null) => {
    const [layout, setLayout] = useState<Map<string, NL>>(new Map());
    const statesRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        const unsub = onDecoderEvent((ev) => {
            if (ev.kind === "tick") return;
            const s = statesRef.current;

            if (ev.kind === "ended") {
                s.delete(ev.source);
            } else if (ev.kind === "lifecycle") {
                if (ev.method === "dispose") {
                    s.delete(ev.source);
                } else if (ev.phase === "start") {
                    s.set(ev.source, ev.method === "load" ? "loaded" : ev.method === "demux" ? "demuxed" : "warm");
                } else if (ev.phase === "end") {
                    s.set(ev.source, ev.method === "play" ? "playing" : ev.method === "pause" ? "warm" : "loaded");
                }
            }

            setLayout((prev) => {
                const next = new Map(prev);
                if (graph) {
                    for (const node of graph.nodes.values()) {
                        const view = next.get(node.id);
                        if (view) {
                            view.state = s.get(node.source) || "idle";
                        }
                    }
                }
                return next;
            });
        });

        return () => unsub();
    }, [graph]);

    useEffect(() => {
        if (!graph) return;

        setLayout((prev) => {
            const next = new Map<string, NL>();
            let idx = 0;

            for (const node of graph.nodes.values()) {
                const old = prev.get(node.id);
                next.set(node.id, {
                    id: node.id,
                    x: old ? old.x : 40 + idx * 210,
                    y: old ? old.y : 80 + (idx % 2) * 110,
                    state: statesRef.current.get(node.source) || "idle",
                });
                idx++;
            }
            return next;
        });
    }, [graph]);

    return {layout, setLayout};
};
export type {NL};