// src/timeline/types.ts
//
// Central type definitions for the Maze nonlinear video player.
// All other modules import from here — this file is the single source
// of truth for the data model and the decoder/factory contracts.

// ---------------------------------------------------------------------------
// Graph data model
// ---------------------------------------------------------------------------

/**
 * A string alias used as the unique identifier for every node in the graph.
 * Using a named alias (instead of plain `string`) makes function signatures
 * self-documenting and easier to refactor if the ID type ever changes.
 */
export type NodeId = string;

/**
 * A single node in the nonlinear timeline graph.
 *
 * Each node represents one video segment:
 *   - `id`      — unique key used to look the node up in TimelineGraph.nodes
 *   - `source`  — URL / path of the media file that this node plays
 *   - `outputs` — ordered list of node IDs the viewer can branch to after
 *                 this segment ends (choices, automatic continuations, etc.)
 *
 * A node with an empty `outputs` array is a terminal node (end of story).
 */
export interface TimelineNode {
    id: NodeId;
    source: string;
    outputs: NodeId[];
}

/**
 * The in-memory representation of the entire nonlinear story graph.
 *
 * `entry` is the ID of the first node to play when a project is loaded.
 * `nodes` is a Map for O(1) lookup by ID — preferred over an array because
 * the controller jumps to arbitrary nodes constantly during playback.
 */
export interface TimelineGraph {
    entry: NodeId;
    nodes: Map<NodeId, TimelineNode>;
}

/**
 * The raw JSON shape that is stored on disk / sent over the network.
 * Nodes are kept as an array in the file (easier to author by hand or export
 * from an editor), and GraphLoader converts it to a Map on load.
 */
export interface TimelineGraphFile {
    entry: NodeId;
    nodes: TimelineNode[]; // flat array — converted to Map by GraphLoader
}

// ---------------------------------------------------------------------------
// Decoder lifecycle state machine
// ---------------------------------------------------------------------------

/**
 * Every managed decoder moves through these states in order:
 *
 *   Idle → Loaded → Demuxed → Warm → Playing
 *                                  ↕
 *                               (pause resumes to Warm)
 *
 * The states map 1-to-1 to the DecoderHandle async methods so that
 * PlaybackController can resume an in-progress preparation sequence
 * without re-running earlier steps.
 */
export const NodeState = {
    /** Decoder has been created but load() has not been called yet. */
    Idle: "idle",

    /** The media file has been fetched / opened (load() completed). */
    Loaded: "loaded",

    /**
     * The container has been demuxed — track metadata is available and
     * encoded packets are ready to be handed to the codec (demux() completed).
     */
    Demuxed: "demuxed",

    /**
     * The codec is initialised and the first frames are decoded into GPU
     * memory — the segment can start playing with zero latency (warm() completed).
     */
    Warm: "warm",

    /** The segment is actively rendering frames to the screen (play() called). */
    Playing: "playing",
} as const;

// Derive the union type from the object values so the constant and the type
// always stay in sync without manual duplication.
export type NodeState = typeof NodeState[keyof typeof NodeState];

// ---------------------------------------------------------------------------
// Decoder abstraction
// ---------------------------------------------------------------------------

/**
 * The interface every concrete decoder must implement.
 *
 * The lifecycle methods are intentionally async and sequential:
 * each one advances the decoder by exactly one state step. This allows
 * PlaybackController to pipeline preparation across multiple nodes
 * (e.g. warm the next nodes while the current one is playing).
 *
 * Implementations:
 *   - WebCodecsDecoder  — real decoder backed by the browser WebCodecs API
 *   - MockDecoder       — logs calls to the console, used in tests/dev
 */
export interface DecoderHandle {
    /** The media source URL/path this decoder was created for. */
    readonly source: string;

    /** Fetch and open the media file. Idle → Loaded. */
    load(): Promise<void>;

    /** Parse container format, extract track info and encoded packets. Loaded → Demuxed. */
    demux(): Promise<void>;

    /**
     * Initialise the codec and pre-decode the first frames into a GPU buffer
     * so that play() starts without any visible stutter. Demuxed → Warm.
     */
    warm(): Promise<void>;

    /** Begin rendering frames. Warm → Playing. */
    play(): Promise<void>;

    /** Pause rendering. Playing → Warm (decoder stays ready to resume). */
    pause(): Promise<void>;

    /**
     * Release all resources (GPU buffers, workers, file handles).
     * Called when a node is evicted from the managed-node cache.
     */
    dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Decoder factory
// ---------------------------------------------------------------------------

/**
 * Abstract factory for creating DecoderHandle instances.
 *
 * Decoupling creation from usage lets the application swap the real
 * WebCodecs implementation for a mock without touching any other class.
 * The factory receives the media `source` string and returns a fresh decoder
 * in the Idle state.
 *
 * Implementations:
 *   - WebCodecsDecoderFactory — produces WebCodecsDecoder instances
 *   - MockFactory             — produces MockDecoder instances
 */
export interface DecoderFactory {
    create(source: string): DecoderHandle;
}

// ---------------------------------------------------------------------------
// Internal controller state
// ---------------------------------------------------------------------------

/**
 * Wraps a TimelineNode together with its runtime decoder and current state.
 *
 * PlaybackController keeps one ManagedNode per node that has been touched
 * since the graph was loaded. This allows:
 *   - Resuming preparation from the exact state it was interrupted at
 *   - Pausing the current node without losing its warm buffer
 *   - Preloading upcoming branches in the background
 */
export interface ManagedNode {
    /** The static graph node this entry corresponds to. */
    node: TimelineNode;

    /** The decoder instance responsible for this node's media. */
    decoder: DecoderHandle;

    /** Current position in the decoder lifecycle state machine. */
    state: NodeState;
}
