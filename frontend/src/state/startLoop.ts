// src/state/startLoop.ts
import type { TimelineEngine }   from "../timeline/TimelineEngine";
import type { IRenderer }        from "../player/IRenderer";
import { WebCodecsRuntime }      from "../player/WebCodecsRuntime";
import { makeCommandProducer }   from "../timeline/toCommands";
import type { Asset }            from "../timeline/types";

export interface PlaybackControls {
    rewind(): void;
}

export function startLoop(
    engine:   TimelineEngine,
    runtime:  WebCodecsRuntime,
    renderer: IRenderer,
    assets:   Asset[]
): PlaybackControls {
    const assetMap        = new Map(assets.map(a => [a.id, a.url]));
    let commandProducer   = makeCommandProducer(assetMap);
    let startTime         = performance.now();
    let rafId             = 0;

    function tick(): void {
        const timelineTime = (performance.now() - startTime) / 1000;

        const state    = engine.getPlaybackState(timelineTime);
        const commands = commandProducer(state);

        // WebCodecsRuntime only understands SET_SOURCE, SWAP, SET_BLEND
        runtime.execute(commands as any);

        // Get the decoded frames for this moment
        const { primary, secondary, blend } = runtime.getFrames(
            state.primaryMediaTime,
            state.secondaryMediaTime,
        );

        renderer.render(primary, secondary, blend);

        rafId = requestAnimationFrame(tick);
    }

    function boot(): void {
        // Kick off demuxers for the first clip immediately at t=0
        const state    = engine.getPlaybackState(0);
        const commands = commandProducer(state);
        runtime.execute(commands as any);
    }

    boot();
    rafId = requestAnimationFrame(tick);

    return {
        rewind() {
            cancelAnimationFrame(rafId);
            runtime.reset();
            commandProducer = makeCommandProducer(assetMap);
            startTime       = performance.now();
            boot();
            rafId = requestAnimationFrame(tick);
        }
    };
}
