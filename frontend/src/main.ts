// src/main.ts
import { loadTimeline }      from "./timeline/loadTimeline";
import { TimelineEngine }    from "./timeline/TimelineEngine";
import { WebCodecsRuntime }  from "./player/WebCodecsRuntime";
import { WebGLRenderer }     from "./player/WebGLRenderer";
import { startLoop }         from "./state/startLoop";

async function start(): Promise<void> {
    if (!("VideoDecoder" in globalThis)) {
        throw new Error("WebCodecs not supported in this browser");
    }

    const timeline = await loadTimeline();
    const engine   = new TimelineEngine(timeline);
    const runtime  = new WebCodecsRuntime();
    const renderer = new WebGLRenderer();

    const controls = startLoop(engine, runtime, renderer, timeline.assets);

    const btn = document.getElementById("btn-rewind") as HTMLButtonElement;
    btn.addEventListener("click", () => controls.rewind());
}

start().catch(err => {
    console.error("[Maze] startup error:", err);
});
