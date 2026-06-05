// src/player/InteractivePlayer.ts
//
// A thin facade over PlaybackController that exposes only the actions a
// viewer (or a UI component) needs: start playback, make a choice, and
// query the current position.
//
// Why does this layer exist?
//   PlaybackController is the low-level engine -- it knows about decoder
//   lifecycles, state machines, and preloading strategy. InteractivePlayer
//   presents a vocabulary that matches what the UI needs to express:
//   "start here", "the user chose this branch", "which node are we on?".
//   Future features like playback history, undo/redo, or analytics hooks
//   can be added here without touching the engine.

import { PlaybackController } from "../timeline/PlaybackController";
import type { DecoderFactory, TimelineGraph } from "../timeline/types";

export class InteractivePlayer {
    /**
     * The underlying playback engine.
     * Private -- callers interact with InteractivePlayer's higher-level API
     * only; they should not reach into the controller directly.
     */
    private readonly controller: PlaybackController;

    constructor(
        graph: TimelineGraph,
        decoderFactory: DecoderFactory,
    ) {
        // Instantiate the controller here so InteractivePlayer owns the
        // engine's lifetime. If we ever need to support multiple simultaneous
        // controllers (e.g. picture-in-picture preview in the editor), the
        // ownership boundary is already clear.
        this.controller = new PlaybackController(graph, decoderFactory);
    }

    /**
     * Begin playback from the given entry node.
     * Called once after the graph is loaded to kick off the experience.
     *
     * Delegates to controller.play() which will load, demux, warm, and
     * start the decoder before returning.
     */
    async start(nodeId: string): Promise<void> {
        await this.controller.play(nodeId);
    }

    /**
     * Handle a viewer choice -- jump to the selected branch node.
     *
     * The name "choose" communicates intent at the product level
     * ("the viewer made an interactive choice"), whereas the underlying
     * controller.jump() communicates mechanism ("seek to a node").
     * Keeping both names makes each layer's purpose self-evident.
     */
    async choose(nodeId: string): Promise<void> {
        await this.controller.jump(nodeId);
    }

    /**
     * Returns the ID of the node currently playing, or null if playback has
     * not started yet.
     * Used by Application to determine which outputs to display as choices.
     */
    getCurrentNode(): string | null {
        return this.controller.getCurrentNode();
    }
}
