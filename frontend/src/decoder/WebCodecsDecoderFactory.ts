// src/decoder/WebCodecsDecoderFactory.ts
//
// Concrete DecoderFactory implementation for production use.
//
// This factory is what gets wired into the application in main.ts.
// Its only responsibility is to instantiate WebCodecsDecoder instances --
// all lifecycle management (when to call load/demux/warm/play/dispose)
// is handled by PlaybackController after it receives the decoder.

import type { DecoderFactory, DecoderHandle } from "../timeline/types";
import { WebCodecsDecoder } from "./WebCodecsDecoder";

export class WebCodecsDecoderFactory implements DecoderFactory {
    /**
     * Create a new WebCodecsDecoder for the given media source.
     *
     * The decoder is returned in the Idle state -- PlaybackController is
     * responsible for advancing it through the lifecycle as needed.
     *
     * @param source  URL or path of the media file this decoder will handle.
     */
    create(source: string): DecoderHandle {
        return new WebCodecsDecoder(source);
    }
}
