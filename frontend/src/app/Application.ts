// src/app/Application.ts
//
// Top-level application controller.

import { GraphLoader }      from "../timeline/GraphLoader";
import { InteractivePlayer } from "../player/InteractivePlayer";
import type { DecoderFactory, TimelineGraph } from "../timeline/types";

export class Application {
    private readonly decoderFactory: DecoderFactory;
    private graph:  TimelineGraph | null = null;
    private player: InteractivePlayer | null = null;

    constructor(decoderFactory: DecoderFactory) {
        this.decoderFactory = decoderFactory;
    }

    async loadGraphFile(file: File): Promise<void> {
        const graph = await GraphLoader.fromFile(file);
        await this.loadGraph(graph);
    }

    async loadGraph(graph: TimelineGraph): Promise<void> {
        this.graph  = graph;
        this.player = new InteractivePlayer(graph, this.decoderFactory);
        await this.player.start(graph.entry);
    }

    async choose(nodeId: string): Promise<void> {
        if (!this.player) throw new Error("Player not initialized");
        await this.player.choose(nodeId);
    }

    getCurrentNodeId(): string | null {
        return this.player?.getCurrentNode() ?? null;
    }

    getCurrentNodeOutputs(): string[] {
        if (!this.player || !this.graph) return [];
        const nodeId = this.player.getCurrentNode();
        if (!nodeId) return [];
        return this.graph.nodes.get(nodeId)?.outputs ?? [];
    }

    /** Expose the loaded graph so external tools (e.g. DebugUI) can read it. */
    getGraph(): TimelineGraph | null {
        return this.graph;
    }

    isLoaded(): boolean {
        return this.player !== null;
    }
}
