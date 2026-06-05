// src/components/EventLog/EventLog.tsx
import React from "react";

export interface LogEntry {
    id: string;
    type: "system" | "decoder" | "choice";
    timestamp: string;
    html: string;
}

interface EventLogProps {
    entries: LogEntry[];
}

export const EventLog: React.FC<EventLogProps> = ({ entries }) => {
    return (
        <aside className="dbg-col dbg-right" style={{ overflowY: "auto" }}>
            <div className="dbg-panel-title">Event log</div>
            <div id="dbg-log" style={{ display: "flex", flexDirection: "column" }}>
                {entries.map(entry => (
                    <div
                        key={entry.id}
                        className={`dbg-log-entry dbg-log-${entry.type}`}
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, padding: "2px 4px" }}
                    >
                        <span className="dbg-ts" style={{ color: "#555", marginRight: 6 }}>{entry.timestamp}</span>
                        <span dangerouslySetInnerHTML={{ __html: entry.html }} />
                    </div>
                ))}
            </div>
        </aside>
    );
};