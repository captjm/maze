// src/main.ts
import { Application } from "./app/Application";
import { MockFactory }  from "./test/MockFactory";
import { DebugUI }      from "./test/DebugUI";
import {GraphLoader} from "./timeline/GraphLoader.ts";
import type {TimelineGraphFile} from "./timeline/types.ts";

const app = new Application(new MockFactory());
const ui  = new DebugUI(app);

const container = document.getElementById("graph-selector-container") || document.body;

async function initGraphSelector() {
    try {
        const response = await fetch('/api/graphs');
        if (!response.ok) throw new Error('Error loading graph list');

        const graphFiles: string[] = await response.json();

        if (graphFiles.length === 0) {
            container.innerHTML = '<p>There are no JSON files in the storage/graphs folder.</p>';
            return;
        }

        const overlay = document.getElementById("empty-overlay");

        const select = document.createElement('select');
        select.id = 'graph-select';

        const defaultOption = document.createElement('option');
        defaultOption.textContent = '';
        defaultOption.value = '';
        select.appendChild(defaultOption);

        graphFiles.forEach(fileName => {
            const option = document.createElement('option');
            option.value = fileName;
            option.textContent = fileName;
            select.appendChild(option);
        });

        container.appendChild(select);

        select.addEventListener('change', async () => {
            const selectedFile = select.value;
            if (!selectedFile) return;

            const fileUrl = `/api/media/graphs/${encodeURIComponent(selectedFile)}`;

            try {
                const fileResponse = await fetch(fileUrl);
                if (!fileResponse.ok) throw new Error('Failed to download graph file');
                const graph =  GraphLoader.fromJson(await fileResponse.json() as TimelineGraphFile);
                await app.loadGraph(graph);
                if (overlay) overlay.classList.add("hidden");
                ui.onGraphLoaded(app.getGraph()!);

                console.log(`Graph ${selectedFile} loaded successfully!`);
            } catch (err) {
                console.error('Error loading the selected graph:', err);
                alert('Error processing graph file');
            }
        });

    } catch (error) {
        console.error('Failed to initialize graph list:', error);
        container.innerHTML = '<p style="color: red;">Error connecting to the graph backend</p>';
    }
}

initGraphSelector().then();