// src/components/GraphEditor/constants.ts
export const NW = 148;      // Node width
export const NH = 60;       // Node height
export const NR = 7;        // Border radius
export const PORT_R = 7;    // Output port handle radius

export const STATE_COLOR: Record<string, string> = {
    idle: "#3a3a4a",
    loaded: "#1d4ed8",
    demuxed: "#7c3aed",
    warm: "#d97706",
    playing: "#16a34a",
};

export const STATE_LABEL: Record<string, string> = {
    idle: "IDLE",
    loaded: "LOADED",
    demuxed: "DEMUX",
    warm: "WARM",
    playing: "PLAYING",
};