// src/timeline/GraphLoader.ts
//
// Responsible for deserialising a Maze project file (.json) into the
// in-memory TimelineGraph structure that the rest of the application uses.

import type { TimelineGraph, TimelineGraphFile } from "./types";

export class GraphLoader {
    /**
     * Reads a JSON project file selected by the user and converts it into a
     * TimelineGraph ready for playback.
     *
     * Why a static method?
     * GraphLoader has no per-instance state — it is essentially a pure
     * transformation function. Keeping it static makes call sites cleaner
     * (`GraphLoader.fromFile(f)` vs `new GraphLoader().fromFile(f)`).
     *
     * Conversion details:
     *   - The file stores nodes as a flat array (easier to hand-author and
     *     diff in version control).
     *   - We convert it to a Map<NodeId, TimelineNode> so that
     *     PlaybackController can look up any node in O(1) during playback,
     *     which happens on every branch transition.
     *
     * @param file  The File object from an <input type="file"> element.
     * @returns     A fully initialised TimelineGraph.
     * @throws      If the file content is not valid JSON or does not conform
     *              to the TimelineGraphFile shape.
     */
    static async fromFile(file: File): Promise<TimelineGraph> {
        // Read the entire file as a UTF-8 string.
        const text = await file.text();

        // Parse and cast — no runtime schema validation yet; malformed files
        // will surface as runtime errors when nodes are accessed.
        const json = JSON.parse(text) as TimelineGraphFile;

        return {
            entry: json.entry,

            // Convert the node array to a Map keyed by node.id.
            // Using Map.entries-style construction from a mapped array is
            // idiomatic TS and avoids a separate forEach/reduce step.
            nodes: new Map(
                json.nodes.map(node => [
                    node.id,
                    node,
                ]),
            ),
        };
    }
}
