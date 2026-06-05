// src/App.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Application } from "./app/Application";
import { MockFactory } from "./test/MockFactory";
import { UI } from "./components/UI";
import type {DebugUIRef} from "./components/UI";
import { GraphLoader } from "./timeline/GraphLoader";
import type { TimelineGraphFile } from "./timeline/types";
import styles from "./App.module.css";

export const App: React.FC = () => {
    const app = useMemo(() => new Application(new MockFactory()), []);
    const debugUIRef = useRef<DebugUIRef | null>(null);

    const [graphFiles, setGraphFiles] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<string>("");
    const [isGraphLoaded, setIsGraphLoaded] = useState<boolean>(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchGraphList() {
            try {
                const response = await fetch('/api/graphs');
                if (!response.ok) throw new Error('Error loading graph list');
                const files: string[] = await response.json();
                setGraphFiles(files);
            } catch (err) {
                console.error(err);
                setLoadingError("Error connecting to the graph backend");
            }
        }
        fetchGraphList();
    }, []);

    const handleGraphChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const fileName = e.target.value;
        setSelectedFile(fileName);

        if (!fileName) {
            setIsGraphLoaded(false);
            return;
        }

        const fileUrl = `/api/media/graphs/${encodeURIComponent(fileName)}`;

        try {
            const fileResponse = await fetch(fileUrl);
            if (!fileResponse.ok) throw new Error('Failed to download graph file');

            const graphData = await fileResponse.json() as TimelineGraphFile;
            const graph = GraphLoader.fromJson(graphData);

            await app.loadGraph(graph);

            const loadedGraph = app.getGraph();
            if (loadedGraph) {
                setIsGraphLoaded(true);

                if (debugUIRef.current) {
                    debugUIRef.current.onGraphLoaded(loadedGraph);
                }
            } else {
                throw new Error('Graph is empty after application load');
            }
        } catch (err) {
            console.error('Error loading the selected graph:', err);
            alert('Error processing graph file');
            setSelectedFile("");
            setIsGraphLoaded(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}>
            <header className={styles.topBar}>
                <span className={styles.logo}>MAZE</span>
                <span className={styles.badge}>Debug Harness</span>

                <div style={{ margin: "0 0 0 auto", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label className={styles.label}>Select Graph:</label>
                        {loadingError ? (
                            <span style={{ color: "#ef4444", fontSize: 11 }}>{loadingError}</span>
                        ) : graphFiles.length === 0 ? (
                            <span style={{ color: "#50507a", fontSize: 11 }}>No graphs found...</span>
                        ) : (
                            <select value={selectedFile} onChange={handleGraphChange} className={styles.select}>
                                <option value="">Choose a graph...</option>
                                {graphFiles.map(file => (
                                    <option key={file} value={file}>{file}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </header>

            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                <UI ref={debugUIRef} app={app} />
            </div>

            {!isGraphLoaded && (
                <div className={styles.overlay}>
                    <div className={styles.overlayBig}>MAZE</div>
                    <div className={styles.overlayHint}>Load a graph.json to start</div>
                </div>
            )}
        </div>
    );
}