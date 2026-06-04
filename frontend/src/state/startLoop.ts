// src/state/startLoop.ts
import type { TimelineEngine } from "../timeline/TimelineEngine";
import type { IRenderer }      from "../player/IRenderer";
import { WebCodecsRuntime }    from "../player/WebCodecsRuntime";
import { makeCommandProducer } from "../timeline/toCommands";
import type { Asset }          from "../timeline/types";

export interface PlaybackControls {
    rewind(): void;
}

export function startLoop(
    engine:   TimelineEngine,
    runtime:  WebCodecsRuntime,
    renderer: IRenderer,
    assets:   Asset[]
): PlaybackControls {
    const assetMap = new Map(assets.map(a => [a.id, a.url]));

    let commandProducer = makeCommandProducer(assetMap);
    let startTime       = performance.now();
    let rafId           = 0;
    let running         = false;

    function tick(): void {
        const timelineTime = (performance.now() - startTime) / 1000;

        const state    = engine.getPlaybackState(timelineTime);
        const commands = commandProducer(state);

        runtime.execute(commands as any);

        console.log(running);

        const primaryMediaTime = state.primaryClip
            ? timelineTime - state.primaryClip.start
            : 0;

        const secondaryMediaTime = state.secondaryClip
            ? timelineTime - state.secondaryClip.start
            : 0;

        const { primary, secondary, blend } = runtime.getFrames(
            primaryMediaTime,
            secondaryMediaTime,
        );

        // Only render when we have at least a primary frame —
        // keeps the canvas black rather than flickering on null
        if (primary !== null) {
            renderer.render(primary, secondary, blend);
        }

        rafId = requestAnimationFrame(tick);
    }

    // Issue SET_SOURCE commands at t=0 so decoders start loading immediately.
    // Then wait for the first frame before starting the render loop.
    function boot(): Promise<void> {
        const state    = engine.getPlaybackState(0);
        const commands = commandProducer(state);
        runtime.execute(commands as any);

        // Poll until primary slot has its first frame ready
        return new Promise(resolve => {
            const check = () => {
                const { primary } = runtime.getFrames(0, 0);
                if (primary !== null) {
                    resolve();
                } else {
                    setTimeout(check, 16); // ~1 frame
                }
            };
            check();
        });
    }

    // Start — boot() resolves when first frame is decoded
    boot().then(() => {
        startTime = performance.now(); // reset clock — don't count loading time
        running   = true;
        rafId     = requestAnimationFrame(tick);
    });

    return {
        rewind() {
            cancelAnimationFrame(rafId);
            running = false;
            runtime.reset();
            commandProducer = makeCommandProducer(assetMap);

            boot().then(() => {
                startTime = performance.now();
                running   = true;
                rafId     = requestAnimationFrame(tick);
            });
        }
    };
}