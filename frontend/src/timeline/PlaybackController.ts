// src/timeline/PlaybackController.ts
//
// The core engine of the Maze player.
//
// Responsibilities:
//   1. Manage a pool of ManagedNode entries (one per visited/preloaded node).
//   2. Drive each decoder through the Idle -> Loaded -> Demuxed -> Warm ->
//      Playing state machine.
//   3. Seamlessly switch playback between nodes on jump() calls.
//   4. Proactively warm the output nodes of whatever is currently playing
//      so that branch transitions feel instantaneous.

import type {
    DecoderFactory,
    ManagedNode,
    NodeId,
    TimelineGraph,
    TimelineNode,
} from "./types.ts";
import { NodeState } from "./types.ts";

export class PlaybackController {
    private readonly graph: TimelineGraph;

    /**
     * Factory used to instantiate a decoder for each new node.
     * Injected at construction time so the real WebCodecs implementation
     * can be swapped for a mock during testing without touching this class.
     */
    private readonly decoderFactory: DecoderFactory;

    /**
     * Cache of every node that has been touched since the graph was loaded.
     * Keeps decoders alive (and potentially warm) so we don't re-load a
     * segment the viewer might jump back to.
     *
     * Key   -- NodeId
     * Value -- ManagedNode (node metadata + decoder + current state)
     */
    private readonly managedNodes = new Map<NodeId, ManagedNode>();

    /** The node currently rendering frames, or null before first play(). */
    private currentNodeId: NodeId | null = null;

    constructor(
        graph: TimelineGraph,
        decoderFactory: DecoderFactory,
    ) {
        this.graph = graph;
        this.decoderFactory = decoderFactory;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Start playing the specified node.
     *
     * Flow:
     *   1. Ensure the target node is Warm (may trigger load/demux/warm if
     *      this is the first time we visit it).
     *   2. Pause the currently-playing node and revert it to Warm so its
     *      buffer stays available for a potential jump-back.
     *   3. Start the target decoder and mark it as Playing.
     *   4. Fire-and-forget background preloading of all output nodes so the
     *      next transitions are instantaneous.
     */
    async play(nodeId: NodeId): Promise<void> {
        // Bring the target node to at least the Warm state before we try to
        // play it, to avoid visible startup latency.
        const managed = await this.ensureWarm(nodeId);

        // Pause whatever is currently on screen (if anything).
        if (this.currentNodeId) {
            const current = this.managedNodes.get(this.currentNodeId);

            if (current) {
                await current.decoder.pause();
                // Revert state to Warm -- the decoder stays buffered in memory
                // in case the viewer jumps back to this node later.
                current.state = NodeState.Warm;
            }
        }

        // Hand off to the decoder and update bookkeeping.
        await managed.decoder.play();
        managed.state = NodeState.Playing;
        this.currentNodeId = nodeId;

        // Start warming the successor nodes in the background.
        // `void` discards the promise intentionally -- failures here should
        // not interrupt playback; they only affect future transition latency.
        void this.preloadOutputs(nodeId);
    }

    /**
     * Jump to a different node mid-playback (user made a choice, an event
     * triggered a branch, editor scrubbed to a new segment, etc.).
     *
     * Currently delegates directly to play(), which handles the
     * pause-current / play-new handoff. Kept as a separate method so that
     * future implementations can add transition effects, seek-within-node
     * logic, or history tracking without touching play().
     */
    async jump(nodeId: NodeId): Promise<void> {
        await this.play(nodeId);
    }

    /** Returns the ID of the node that is currently playing, or null. */
    getCurrentNode(): NodeId | null {
        return this.currentNodeId;
    }

    /**
     * Explicitly warm a node that is not yet playing.
     * Called by the editor or external logic that knows a branch will be
     * needed soon (e.g. a countdown before an interactive choice appears).
     */
    async preload(nodeId: NodeId): Promise<void> {
        await this.ensureWarm(nodeId);
    }

    /**
     * Tear down all managed decoders and clear the cache.
     * Should be called when the graph is unloaded or the player is destroyed
     * to release GPU memory, worker threads, and file handles.
     */
    async dispose(): Promise<void> {
        for (const managed of this.managedNodes.values()) {
            await managed.decoder.dispose();
        }
        this.managedNodes.clear();
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Warm all direct successors of the given node in parallel.
     *
     * Called after play() so that while the current segment is running,
     * the next possible segments are already buffered in GPU memory.
     * Promise.all is used so all successors are prepared concurrently rather
     * than one-by-one, which matters when a node has multiple outputs.
     */
    private async preloadOutputs(nodeId: NodeId): Promise<void> {
        const node = this.getNode(nodeId);

        await Promise.all(
            node.outputs.map(outputId =>
                this.ensureWarm(outputId),
            ),
        );
    }

    /**
     * Advance a node's decoder to the Warm state (or return immediately if
     * it is already Warm or Playing).
     *
     * The method is idempotent and resumable: if a previous call was
     * interrupted (e.g. by a rapid user choice) the next call picks up from
     * whatever state the decoder reached, without re-running earlier steps.
     *
     * State machine transitions triggered here:
     *   Idle     -> load()  -> Loaded
     *   Loaded   -> demux() -> Demuxed
     *   Demuxed  -> warm()  -> Warm
     */
    private async ensureWarm(nodeId: NodeId): Promise<ManagedNode> {
        // getOrCreate ensures the ManagedNode entry exists in the cache.
        const managed = this.getOrCreateManagedNode(nodeId);

        // Already at or past the target state -- nothing to do.
        if (
            managed.state === NodeState.Warm ||
            managed.state === NodeState.Playing
        ) {
            return managed;
        }

        // Each `if` block advances the decoder by one step. Using separate
        // `if` statements (not `else if`) means a single ensureWarm() call
        // will run through all necessary steps in sequence even when starting
        // from Idle, while still allowing safe re-entry at any intermediate step.

        if (managed.state === NodeState.Idle) {
            await managed.decoder.load();
            managed.state = NodeState.Loaded;
        }

        if (managed.state === NodeState.Loaded) {
            await managed.decoder.demux();
            managed.state = NodeState.Demuxed;
        }

        if (managed.state === NodeState.Demuxed) {
            await managed.decoder.warm();
            managed.state = NodeState.Warm;
        }

        return managed;
    }

    /**
     * Returns the ManagedNode for the given ID, creating it (in the Idle
     * state) if it has not been seen before.
     *
     * Separating creation from ensureWarm keeps responsibility clear:
     * this method only guarantees the entry exists; ensureWarm decides
     * how far to advance it.
     */
    private getOrCreateManagedNode(nodeId: NodeId): ManagedNode {
        const existing = this.managedNodes.get(nodeId);
        if (existing) {
            return existing;
        }

        const node = this.getNode(nodeId);

        // Create a fresh decoder via the injected factory.
        // The factory abstraction means this line works identically whether
        // we are in production (WebCodecsDecoder) or a test (MockDecoder).
        const managed: ManagedNode = {
            node,
            decoder: this.decoderFactory.create(node.source),
            state: NodeState.Idle,
        };

        this.managedNodes.set(nodeId, managed);
        return managed;
    }

    /**
     * Looks up a node in the graph by ID and throws a descriptive error if
     * not found, rather than letting a silent `undefined` propagate and
     * cause a cryptic crash later.
     */
    private getNode(nodeId: NodeId): TimelineNode {
        const node = this.graph.nodes.get(nodeId);

        if (!node) {
            throw new Error(`Node "${nodeId}" not found`);
        }

        return node;
    }
}
