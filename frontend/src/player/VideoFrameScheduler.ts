// src/player/VideoFrameScheduler.ts

/**
 * Wraps requestVideoFrameCallback with a fallback to requestAnimationFrame
 * for browsers that don't support rVFC (Firefox as of 2025).
 *
 * Usage:
 *   const scheduler = new VideoFrameScheduler(videoElement);
 *   scheduler.start((mediaTime) => { ... });
 *   scheduler.stop();
 *   scheduler.setVideo(newVideoElement); // after SWAP
 */

export type FrameCallback = (mediaTime: number) => void;

const supportsRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

export class VideoFrameScheduler {
    private video:    HTMLVideoElement;
    private callback: FrameCallback | null = null;
    private running   = false;
    private readonly schedule: () => void;
    // rAF fallback
    private rafId:    number | null = null;

    constructor(video: HTMLVideoElement) {
        this.video = video;
        this.schedule = supportsRVFC
            ? this.scheduleVideoFrame
            : this.scheduleAnimationFrame;
    }

    start(cb: FrameCallback): void {
        this.callback = cb;
        this.running  = true;
        this.schedule();
    }

    stop(): void {
        this.running  = false;
        this.callback = null;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /** Call after SWAP — transfers scheduling to the new primary video. */
    setVideo(video: HTMLVideoElement): void {
        this.video = video;
        // Re-schedule on the new element; the previous rVFC registration
        // is silently abandoned (it fires once more at most, which is harmless).
        if (this.running) {
            this.schedule();
        }
    }

    private scheduleVideoFrame = () => {
        if (!this.running || !this.callback) return;
        this.video.requestVideoFrameCallback((_now, meta) => {
                if (!this.running) return;
                this.callback!(meta.mediaTime);
                this.schedule();
        });
    }

    private scheduleAnimationFrame = () => {
        if (!this.running || !this.callback) return;
            // rAF fallback: use video.currentTime as best approximation
            this.rafId = requestAnimationFrame(() => {
                if (!this.running) return;
                this.callback!(this.video.currentTime);
                this.schedule();
            });
    }
}