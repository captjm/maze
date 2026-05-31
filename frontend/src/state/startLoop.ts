// src/state/startLoop.ts
import type { TimelineEngine } from "../timeline/TimelineEngine";
import type { MediaRuntime }   from "../player/MediaRuntime";
import type { CanvasRenderer } from "../player/CanvasRenderer";
import { VideoFrameScheduler } from "../player/VideoFrameScheduler";
import { makeCommandProducer } from "../timeline/toCommands";
import type { Asset, Clip }    from "../timeline/types";

export interface PlaybackControls {
    rewind(): void;
}

export function startLoop(
    engine:   TimelineEngine,
    runtime:  MediaRuntime,
    renderer: CanvasRenderer,
    assets:   Asset[]
): PlaybackControls {
    const assetMap = new Map(assets.map(a => [a.id, a.url]));

    let commandProducer    = makeCommandProducer(assetMap);
    let currentPrimaryClip: Clip | null = null;

    const scheduler = new VideoFrameScheduler(runtime.getPrimary());

    function boot(): void {
        // Cold start: drive timeline at t=0 before the first rVFC fires.
        // This issues SET_SOURCE / SET_CURRENT_TIME so the decoder can
        // begin loading frames immediately.
        const state    = engine.getPlaybackState(0);
        const commands = commandProducer(state);
        runtime.execute(commands);
        currentPrimaryClip = state.primaryClip;
    }

    function onFrame(mediaTime: number): void {
        // Convert video file position → timeline position.
        // clip.start  = where this clip sits on the timeline (seconds)
        // clip.mediaStart = offset into the source file (default 0)
        const clip         = currentPrimaryClip;
        const timelineTime = clip
            ? clip.start + (mediaTime - (clip.mediaStart ?? 0))
            : mediaTime;

        const state    = engine.getPlaybackState(timelineTime);
        const commands = commandProducer(state);

        const hasSwap = commands.some(c => c.type === "SWAP");

        runtime.execute(commands);

        if (hasSwap) {
            // Re-register rVFC on the new primary element
            scheduler.setVideo(runtime.getPrimary());
        }

        currentPrimaryClip = state.primaryClip;

        renderer.render(
            runtime.getPrimary(),
            runtime.getSecondary(),
            runtime.getBlend()
        );
    }

    boot();
    scheduler.start(onFrame);

    return {
        rewind() {
            scheduler.stop();
            runtime.reset();
            commandProducer    = makeCommandProducer(assetMap);
            currentPrimaryClip = null;
            boot();
            scheduler.setVideo(runtime.getPrimary());
            scheduler.start(onFrame);
        }
    };
}