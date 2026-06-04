// src/test/MockFactory.ts
//
// Test/development implementation of DecoderFactory that produces MockDecoders.
//
// Swap this for WebCodecsDecoderFactory in main.ts (or Application's
// constructor) to run the entire application without touching any real media
// decoding infrastructure. Useful for:
//   - Unit tests that verify PlaybackController logic in isolation
//   - Manual smoke-testing the branch/jump flow with dummy graph files
//   - CI environments where WebCodecs is not available

import type { DecoderFactory, DecoderHandle } from "../timeline/types";
import { MockDecoder } from "./MockDecoder";

export class MockFactory implements DecoderFactory {
    /**
     * Returns a new MockDecoder for the given source.
     * The source string is passed through so MockDecoder can include it in
     * its console logs, making call traces readable when many nodes coexist.
     */
    create(source: string): DecoderHandle {
        return new MockDecoder(source);
    }
}
