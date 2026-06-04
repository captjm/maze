// src/player/ClipDecoder.ts
import { MP4Demuxer }  from "./MP4Demuxer";
import { FrameBuffer } from "./FrameBuffer";

const BUFFER_FRAMES = 100; // 4 seconds at 30fps

export class ClipDecoder {
    private readonly buffer:  FrameBuffer;
    private readonly decoder: VideoDecoder;
    private _ready = false; // at least one frame decoded

    private constructor() {
        this.buffer = new FrameBuffer(BUFFER_FRAMES);

        this.decoder = new VideoDecoder({
            output: (frame) => {
                this._ready = true;
                this.buffer.push(frame);
            },
            error: (e) => console.error("[ClipDecoder] decoder error:", e),
        });
    }

    // ── Factory ────────────────────────────────────────────────────────────

    /**
     * Starts streaming + decoding immediately.
     * Resolves when the FIRST frame is available in the buffer —
     * so getFrameAt(0) is guaranteed to return non-null after await.
     */
    static create(url: string): Promise<ClipDecoder> {
        return new Promise((resolve, reject) => {
            const dec = new ClipDecoder();
            let resolved  = false;

            const checkReady = () => {
                if (!resolved && dec._ready) {
                    resolved = true;
                    resolve(dec);
                }
            };

            MP4Demuxer.fromURL(url, {
                onConfig(config) {
                    dec.decoder.configure(config);
                },
                onChunk(chunk) {
                    if (dec.decoder.state === "configured") {
                        dec.decoder.decode(chunk);
                        // VideoDecoder output callback fires synchronously in some
                        // browsers but not all — poll after each decode call
                        checkReady();
                    }
                },
                onDone() {
                    dec.decoder.flush().then(() => {
                        checkReady(); // resolve if we haven't yet (very short clip)
                    }).catch(reject);
                },
                onError(e) {
                    if (!resolved) reject(e);
                },
            }).catch(e => { if (!resolved) reject(e); });

            // Also poll via microtask — output callback may fire async
            const poll = () => {
                checkReady();
                if (!resolved) setTimeout(poll, 10);
            };
            poll();
        });
    }

    // ── Per-frame API ──────────────────────────────────────────────────────

    get ready(): boolean { return this._ready; }

    /**
     * Returns the decoded frame closest to (but not after) mediaTimeSec.
     * Returns null only if no frames have been decoded yet.
     */
    getFrameAt(mediaTimeSec: number): VideoFrame | null {
        const ts = Math.round(mediaTimeSec * 1_000_000); // seconds → microseconds
        return this.buffer.getFrameAt(ts);
    }

    /**
     * Release GPU memory for frames well behind the playhead.
     * Keeps a 2-second window behind to handle jitter safely.
     */
    evictBefore(mediaTimeSec: number): void {
        if (mediaTimeSec <= 2) return; // never evict near the start
        const ts = Math.round((mediaTimeSec - 2) * 1_000_000);
        this.buffer.evictBefore(ts);
    }

    dispose(): void {
        this.buffer.dispose();
        if (this.decoder.state !== "closed") {
            this.decoder.close();
        }
    }
}