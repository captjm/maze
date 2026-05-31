// src/player/ClipDecoder.ts
//
// Owns one VideoDecoder + FrameBuffer for a single clip asset.
//
// Lifecycle:
//   const dec = await ClipDecoder.create(url);
//   dec.getFrameAt(timestampMicros);   // called every render frame
//   dec.dispose();                     // when the clip is no longer needed
//
// Prefetch strategy:
//   The demuxer streams the entire file sequentially. Decoded frames fill the
//   buffer (capacity = BUFFER_FRAMES). When the buffer is full the oldest frames
//   are evicted automatically by FrameBuffer.push(). Because keyint=30 and
//   playback is linear, the decoder always runs ahead of the playhead.
//
//   evictBefore() is called each render frame to release GPU memory for frames
//   that are already past.

import { MP4Demuxer }  from "./MP4Demuxer";
import { FrameBuffer } from "./FrameBuffer";

/** Number of decoded frames to keep in memory per clip. At 30fps: 90 = 3 seconds. */
const BUFFER_FRAMES = 90;

export class ClipDecoder {
    private readonly buffer:  FrameBuffer;
    private readonly decoder: VideoDecoder;
    private done = false; // demux finished
    private readonly url: string;

    private constructor(
        url: string,
    ) {
        this.url = url;
        this.buffer = new FrameBuffer(BUFFER_FRAMES);

        this.decoder = new VideoDecoder({
            output: (frame) => this.buffer.push(frame),
            error:  (e)     => console.error(`[ClipDecoder] ${this.url}:`, e),
        });
    }

    // ── Factory ────────────────────────────────────────────────────────────

    /**
     * Creates a ClipDecoder and starts streaming + decoding immediately.
     * Resolves once the codec config has been parsed (moov box received) —
     * frames may not be ready yet but the decoder is configured and running.
     */
    static create(url: string): Promise<ClipDecoder> {
        return new Promise((resolve, reject) => {
            const dec = new ClipDecoder(url);
            let configured = false;

            MP4Demuxer.fromURL(url, {
                onConfig(config) {
                    dec.decoder.configure(config);
                    configured = true;
                    resolve(dec); // resolve early — don't wait for all frames
                },
                onChunk(chunk) {
                    if (dec.decoder.state === "configured") {
                        dec.decoder.decode(chunk);
                    }
                },
                onDone() {
                    dec.decoder.flush().then(() => { dec.done = true; });
                },
                onError(e) {
                    if (!configured) reject(e);
                    else console.error(`[ClipDecoder] demux error ${url}:`, e);
                },
            }).catch(reject);
        });
    }

    // ── Per-frame API ──────────────────────────────────────────────────────

    /**
     * Returns the VideoFrame closest to (but not after) the requested
     * media timestamp in seconds. Returns null if the frame isn't buffered yet.
     *
     * The returned frame is still owned by FrameBuffer — do NOT call .close() on it.
     * It remains valid until the next evictBefore() call that would remove it.
     */
    getFrameAt(mediaTimeSec: number): VideoFrame | null {
        const ts = mediaTimeSec * 1_000_000; // → microseconds
        return this.buffer.getFrameAt(ts);
    }

    /**
     * Release all frames before the given media time.
     * Call once per render frame with the current playhead position.
     */
    evictBefore(mediaTimeSec: number): void {
        // Keep at least one second behind playhead so slight jitter doesn't
        // cause a miss on the current frame.
        const ts = Math.max(0, (mediaTimeSec - 1) * 1_000_000);
        this.buffer.evictBefore(ts);
    }

    /** True when all frames have been decoded and buffered. */
    get isComplete(): boolean { return this.done && this.buffer.size === 0; }

    /** Close all frames and destroy the decoder. */
    dispose(): void {
        this.buffer.dispose();
        if (this.decoder.state !== "closed") {
            this.decoder.close();
        }
    }
}
