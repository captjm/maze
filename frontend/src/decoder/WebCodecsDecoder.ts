// src/decoder/WebCodecsDecoder.ts
//
// Production decoder backed by the browser's WebCodecs API.
//
// WebCodecs gives low-level, low-latency access to hardware video decoders
// directly from JavaScript, bypassing the higher-level <video> element.
// This is essential for Maze because:
//   - We need to pre-decode and hold multiple segments in GPU memory
//     simultaneously so branch transitions are seamless.
//   - We need precise control over when decoding starts and stops.
//   - The <video> element does not expose enough hooks for the warm/preload
//     strategy implemented in PlaybackController.
//
// Current status: method bodies are stubs — the real WebCodecs pipeline
// (VideoDecoder, AudioDecoder, mp4box demux integration, canvas rendering)
// will be implemented here incrementally.

import type { DecoderHandle } from "../timeline/types.ts";

export class WebCodecsDecoder implements DecoderHandle {
    /** The media URL/path this decoder instance was created for. */
    public readonly source: string;

    constructor(source: string) {
        this.source = source;
    }

    /**
     * Fetch and open the media container.
     *
     * TODO: Use the Fetch API (or a Service Worker cache) to retrieve the
     * file at `this.source`, pipe it into mp4box for container parsing, and
     * extract the video/audio track descriptors needed for codec initialisation.
     *
     * Idle → Loaded
     */
    async load(): Promise<void> {
        // stub
    }

    /**
     * Demux the container into encoded video and audio packets.
     *
     * TODO: Walk the mp4box sample tables to extract encoded packets (samples)
     * per track and queue them for the codec. Track timing metadata (PTS, DTS)
     * should be captured here for A/V sync.
     *
     * Loaded → Demuxed
     */
    async demux(): Promise<void> {
        // stub
    }

    /**
     * Initialise the hardware codec and pre-decode the opening frames into a
     * GPU-backed VideoFrame buffer so play() can present the first frame
     * without any visible latency.
     *
     * TODO: Instantiate VideoDecoder with the codec config extracted during
     * demux, feed the first N encoded chunks, and keep the decoded VideoFrames
     * in a ring buffer ready for the render loop.
     *
     * Demuxed → Warm
     */
    async warm(): Promise<void> {
        // stub
    }

    /**
     * Begin the render loop — draw decoded VideoFrames to the canvas on each
     * animation frame, and start the audio worklet.
     *
     * TODO: Start requestVideoFrameCallback / requestAnimationFrame render
     * loop, synchronise audio via AudioContext, and resume feeding encoded
     * chunks to VideoDecoder as the playhead advances.
     *
     * Warm → Playing
     */
    async play(): Promise<void> {
        // stub
    }

    /**
     * Suspend the render loop and stop the audio worklet, but keep all
     * decoded frames and the codec instance alive so play() can resume
     * with no re-initialisation cost.
     *
     * Playing → Warm
     */
    async pause(): Promise<void> {
        // stub
    }

    /**
     * Close the VideoDecoder/AudioDecoder, release VideoFrame GPU memory,
     * and cancel any pending fetch/demux operations.
     *
     * Must be called when the node is evicted from the managed-node pool to
     * avoid GPU memory leaks. VideoFrame objects must be explicitly .close()d
     * because they are not garbage-collected automatically.
     */
    async dispose(): Promise<void> {
        // stub
    }
}
