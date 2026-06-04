// src/main.ts
//
// Application bootstrap wired to the DebugUI test harness.
// Uses MockFactory instead of WebCodecsDecoderFactory so the full
// application flow can be exercised without real media files.

import { Application } from "./app/Application";
import { MockFactory }  from "./test/MockFactory";
import { DebugUI }      from "./test/DebugUI";

// Use MockFactory for browser testing — swap for WebCodecsDecoderFactory
// when real media decoding is ready.
const app = new Application(new MockFactory());
const ui  = new DebugUI(app);

const graphInput = document.getElementById("graph-file") as HTMLInputElement;

graphInput.addEventListener("change", async () => {
    const file = graphInput.files?.[0];
    if (!file) return;

    await app.loadGraphFile(file);

    // getGraph() is guaranteed non-null immediately after loadGraphFile().
    ui.onGraphLoaded(app.getGraph()!);
});
