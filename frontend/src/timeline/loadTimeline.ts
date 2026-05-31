// src/timeline/loadTimeline.ts
import type { Timeline } from "./types";

export async function loadTimeline(): Promise<Timeline> {
    const response = await fetch("/timeline.json");

    if (!response.ok) {
        throw new Error(`Cannot load timeline: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Timeline>;
}