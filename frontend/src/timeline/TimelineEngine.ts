// src/timeline/TimelineEngine.ts
import type { Timeline, PlaybackState } from "./types";

export type { PlaybackState };

export class TimelineEngine {
    private timeline: Timeline;

    constructor(timeline: Timeline) {
        this.timeline = timeline;
    }

    getPlaybackState(time: number): PlaybackState {
        const track = this.timeline.tracks[0];
        if (!track) {
            return { primaryClip: null, secondaryClip: null, transitionProgress: 0 };
        }

        const clips = track.clips;

        for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const clipEnd = clip.start + clip.duration;

            if (time < clip.start) break; // clips are ordered, nothing further matches
            if (time >= clipEnd)   continue;

            // time is within this clip
            const next = clips[i + 1];

            // No overlap with next — plain playback
            if (!next || next.start >= clipEnd) {
                return { primaryClip: clip, secondaryClip: null, transitionProgress: 0 };
            }

            // Overlap zone: next.start .. clipEnd
            // transitionDuration is exactly the overlap length
            const transitionStart    = next.start;
            const transitionDuration = clipEnd - next.start; // > 0 guaranteed

            if (time < transitionStart) {
                // Still before the overlap — no transition yet, but preload secondary
                return { primaryClip: clip, secondaryClip: next, transitionProgress: 0 };
            }

            // Inside the overlap — compute progress [0..1)
            // We clamp to just below 1; the SWAP fires when secondaryClip goes null
            // (i.e. when time >= clipEnd and the loop picks up the next clip as primary)
            const progress = Math.min(
                (time - transitionStart) / transitionDuration,
                1
            );

            return { primaryClip: clip, secondaryClip: next, transitionProgress: progress };
        }

        return { primaryClip: null, secondaryClip: null, transitionProgress: 0 };
    }
}