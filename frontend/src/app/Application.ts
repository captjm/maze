// src/app/Application.ts
//
// Top-level application controller.

import { GraphLoader }       from "../timeline/GraphLoader";
import { InteractivePlayer } from "../player/InteractivePlayer";
import type { DecoderFactory, TimelineGraph, TimelineNode } from "../timeline/types";

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

    /**
     * Preview a specific node from the beginning.
     * Creates a fresh InteractivePlayer so the node restarts from scratch
     * rather than resuming from a warm/playing state.
     */
    async previewNode(nodeId: string): Promise<void> {
        if (!this.graph) throw new Error("No graph loaded");
        // Re-instantiate the player so every decoder is disposed and recreated.
        this.player = new InteractivePlayer(this.graph, this.decoderFactory);
        await this.player.start(nodeId);
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

    /**
     * Replace the graph with an edited version from GraphEditor.
     * Re-initialises the player from the (possibly new) entry node.
     */
    async applyGraphEdit(graph: TimelineGraph): Promise<void> {
        this.graph  = graph;
        this.player = new InteractivePlayer(graph, this.decoderFactory);
        await this.player.start(graph.entry);
    }

    /**
     * Mutate a node in the current graph (id, source, outputs).
     * The player is NOT restarted -- call previewNode() manually if needed.
     */
    updateNode(nodeId: string, patch: Partial<TimelineNode>): void {
        if (!this.graph) return;
        const node = this.graph.nodes.get(nodeId);
        if (!node) return;

        if (patch.id && patch.id !== nodeId) {
            // Rename: remove old key, add new key, update all edges
            const updated: TimelineNode = { ...node, ...patch, id: patch.id };
            this.graph.nodes.delete(nodeId);
            this.graph.nodes.set(patch.id, updated);
            // Fix edges pointing to old id
            for (const n of this.graph.nodes.values()) {
                const idx = n.outputs.indexOf(nodeId);
                if (idx !== -1) n.outputs[idx] = patch.id;
            }
            // Fix entry
            if (this.graph.entry === nodeId) this.graph.entry = patch.id;
        } else {
            Object.assign(node, patch);
        }
    }

    /**
     * Add a brand-new node to the graph.
     */
    addNode(node: TimelineNode): void {
        if (!this.graph) return;
        this.graph.nodes.set(node.id, node);
    }

    /**
     * Delete a node and remove it from all edges.
     */
    deleteNode(nodeId: string): void {
        if (!this.graph) return;
        this.graph.nodes.delete(nodeId);
        for (const n of this.graph.nodes.values()) {
            n.outputs = n.outputs.filter(id => id !== nodeId);
        }
    }

    isLoaded(): boolean {
        return this.player !== null;
    }
}