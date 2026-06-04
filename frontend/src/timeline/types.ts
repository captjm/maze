// src/timeline/types.ts

export interface Timeline {
    version: number;
    assets: Asset[];
    tracks: Track[];
}

export interface Asset {
    id: string;
    url: string;
}

export interface Track {
    id: string;
    clips: Clip[];
}

export interface Clip {
    mediaStart: number;
    assetId: string;
    start: number;
    duration: number;

    transition?: {
        type: string;
        duration: number;
    };
}

export interface PlaybackState {
    primaryClip: Clip | null;
    secondaryClip: Clip | null;
    transitionProgress: number;
}
