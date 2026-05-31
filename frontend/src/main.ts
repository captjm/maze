// src/main.ts
import { loadTimeline }   from "./timeline/loadTimeline";
import { TimelineEngine } from "./timeline/TimelineEngine";
import { MediaRuntime }   from "./player/MediaRuntime";
import { CanvasRenderer } from "./player/CanvasRenderer";
import { startLoop }      from "./state/startLoop";

async function start(): Promise<void> {
    const timeline = await loadTimeline();

    const engine   = new TimelineEngine(timeline);
    const runtime  = new MediaRuntime();
    const renderer = new CanvasRenderer();

    const controls = startLoop(engine, runtime, renderer, timeline.assets);

    const btn = document.getElementById("btn-rewind") as HTMLButtonElement;
    btn.addEventListener("click", () => controls.rewind());
}

start().catch(err => {
    console.error("[Maze] startup error:", err);
});