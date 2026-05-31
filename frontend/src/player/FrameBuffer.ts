// src/player/FrameBuffer.ts
//
// Ring buffer of decoded VideoFrame objects, indexed by timestamp (microseconds).
//
// Invariants:
//   - frames are stored in ascending timestamp order
//   - capacity is fixed; oldest frame is evicted (and closed) when full
//   - getFrameAt() returns the latest frame whose timestamp ≤ requested ts
//   - all frames must be .close()-d before they are dropped to free GPU memory

const EMPTY_SENTINEL = -1;

export class FrameBuffer {
    private readonly frames:     (VideoFrame | null)[];
    private readonly timestamps: Float64Array; // parallel array — avoids object alloc
    private head  = 0;  // index of oldest frame
    private count = 0;  // number of valid frames
    private readonly capacity: number

    constructor(capacity: number) {
        this.frames     = new Array(capacity).fill(null);
        this.timestamps = new Float64Array(capacity).fill(EMPTY_SENTINEL);
        this.capacity = capacity;
    }

    // ── Write ──────────────────────────────────────────────────────────────

    push(frame: VideoFrame): void {
        const ts  = frame.timestamp; // microseconds

        // If full, evict the oldest slot
        if (this.count === this.capacity) {
            this.frames[this.head]?.close();
            this.frames[this.head]     = null;
            this.timestamps[this.head] = EMPTY_SENTINEL;
            this.head = (this.head + 1) % this.capacity;
            this.count--;
        }

        const slot = (this.head + this.count) % this.capacity;
        this.frames[slot]     = frame;
        this.timestamps[slot] = ts;
        this.count++;
    }

    // ── Read ───────────────────────────────────────────────────────────────

    /**
     * Returns the most recent frame whose timestamp ≤ requestedTs (µs),
     * or null if no such frame exists yet (buffer empty or all frames are
     * in the future).
     *
     * Does NOT close or consume the frame — caller must not close it.
     * The buffer retains ownership until the frame is evicted.
     */
    getFrameAt(requestedTs: number): VideoFrame | null {
        if (this.count === 0) return null;

        let best: VideoFrame | null = null;
        let bestTs = EMPTY_SENTINEL;

        for (let i = 0; i < this.count; i++) {
            const slot = (this.head + i) % this.capacity;
            const ts   = this.timestamps[slot];
            if (ts <= requestedTs && ts > bestTs) {
                bestTs = ts;
                best   = this.frames[slot];
            }
        }

        return best;
    }

    /** Timestamp (µs) of the newest frame in the buffer, or -1 if empty. */
    get newestTimestamp(): number {
        if (this.count === 0) return EMPTY_SENTINEL;
        const slot = (this.head + this.count - 1) % this.capacity;
        return this.timestamps[slot];
    }

    /** Timestamp (µs) of the oldest frame in the buffer, or -1 if empty. */
    get oldestTimestamp(): number {
        if (this.count === 0) return EMPTY_SENTINEL;
        return this.timestamps[this.head];
    }

    get size(): number { return this.count; }

    /** Drop all frames before the given timestamp to free GPU memory. */
    evictBefore(ts: number): void {
        while (this.count > 0) {
            const slot = this.head;
            if (this.timestamps[slot] >= ts) break;
            this.frames[slot]?.close();
            this.frames[slot]     = null;
            this.timestamps[slot] = EMPTY_SENTINEL;
            this.head = (this.head + 1) % this.capacity;
            this.count--;
        }
    }

    /** Close and drop every frame. Call when the clip is no longer needed. */
    dispose(): void {
        for (let i = 0; i < this.capacity; i++) {
            this.frames[i]?.close();
            this.frames[i]     = null;
            this.timestamps[i] = EMPTY_SENTINEL;
        }
        this.head  = 0;
        this.count = 0;
    }
}
