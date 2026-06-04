// src/test/MockDecoder.ts
//
// Development/test decoder with realistic async timing and playback simulation.
//
// Lifecycle events (load/demux/warm/play/pause/dispose) are emitted via a
// global bus so DebugUI and MockVideoPlayer can react without direct coupling.
//
// When play() is called, the decoder also starts an internal timer that fires
// a "playback:tick" event every ~16ms (≈60fps) with the current progress
// fraction [0..1], and a "playback:ended" event when the segment finishes.
// The duration is randomised per-instance to simulate varied clip lengths.

import type { DecoderHandle } from "../timeline/types";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type DecoderMethod = "load" | "demux" | "warm" | "play" | "pause" | "dispose";

export interface DecoderLifecycleEvent {
    kind: "lifecycle";
    source: string;
    method: DecoderMethod;
    phase: "start" | "end";
    timestamp: number;
}

export interface DecoderTickEvent {
    kind: "tick";
    source: string;
    /** Playback progress in [0, 1]. */
    progress: number;
    /** Elapsed ms. */
    elapsed: number;
    /** Total duration ms. */
    duration: number;
}

export interface DecoderEndedEvent {
    kind: "ended";
    source: string;
}

export type DecoderEvent =
    | DecoderLifecycleEvent
    | DecoderTickEvent
    | DecoderEndedEvent;

type EventListener = (event: DecoderEvent) => void;

// Global event bus — all decoder instances share this set of listeners.
const listeners = new Set<EventListener>();

export function onDecoderEvent(cb: EventListener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function emit(event: DecoderEvent): void {
    for (const cb of listeners) cb(event);
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/** ms range for each lifecycle step. */
const STEP_DELAYS: Record<DecoderMethod, [number, number]> = {
    load:    [80, 200],
    demux:   [30,  80],
    warm:    [50, 120],
    play:    [10,  20],
    pause:   [10,  20],
    dispose: [ 5,  15],
};

function sleep(method: DecoderMethod): Promise<void> {
    const [min, max] = STEP_DELAYS[method];
    const ms = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// MockDecoder
// ---------------------------------------------------------------------------

export class MockDecoder implements DecoderHandle {
    public readonly source: string;

    /** Simulated clip duration in ms — randomised once at construction. */
    private readonly duration: number;

    /** rAF / interval handle for the playback tick loop. */
    private tickHandle: number | null = null;

    /** Timestamp (performance.now()) when play() last started. */
    private playStarted: number | null = null;

    /** Accumulated playback time before the last pause, in ms. */
    private accumulatedMs = 0;

    constructor(source: string) {
        this.source   = source;
        // Clips are 4–10 seconds long.
        this.duration = 4000 + Math.random() * 6000;
    }

    // -----------------------------------------------------------------------
    // Lifecycle steps
    // -----------------------------------------------------------------------

    private async step(method: DecoderMethod): Promise<void> {
        emit({ kind: "lifecycle", source: this.source, method, phase: "start", timestamp: Date.now() });
        await sleep(method);
        emit({ kind: "lifecycle", source: this.source, method, phase: "end",   timestamp: Date.now() });
    }

    async load():    Promise<void> { await this.step("load");    }
    async demux():   Promise<void> { await this.step("demux");   }
    async warm():    Promise<void> { await this.step("warm");    }
    async dispose(): Promise<void> { this.stopTick(); await this.step("dispose"); }

    async play(): Promise<void> {
        await this.step("play");
        this.playStarted = performance.now();
        this.startTick();
    }

    async pause(): Promise<void> {
        // Accumulate elapsed time so resume continues from the right position.
        if (this.playStarted !== null) {
            this.accumulatedMs += performance.now() - this.playStarted;
            this.playStarted = null;
        }
        this.stopTick();
        await this.step("pause");
    }

    // -----------------------------------------------------------------------
    // Playback tick loop
    // -----------------------------------------------------------------------

    private startTick(): void {
        const tick = () => {
            const sinceStart = this.playStarted !== null
                ? performance.now() - this.playStarted
                : 0;
            const elapsed  = this.accumulatedMs + sinceStart;
            const progress = Math.min(elapsed / this.duration, 1);

            emit({ kind: "tick", source: this.source, progress, elapsed, duration: this.duration });

            if (progress >= 1) {
                this.stopTick();
                emit({ kind: "ended", source: this.source });
            } else {
                this.tickHandle = requestAnimationFrame(tick);
            }
        };

        this.tickHandle = requestAnimationFrame(tick);
    }

    private stopTick(): void {
        if (this.tickHandle !== null) {
            cancelAnimationFrame(this.tickHandle);
            this.tickHandle = null;
        }
    }
}