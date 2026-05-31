// src/player/MP4Demuxer.ts
//
// Parses a fragmented MP4 (fMP4) via the MP4Box.js library and emits
// EncodedVideoChunk objects ready for VideoDecoder.
//
// Assumptions (enforced by the ffmpeg preparation pipeline):
//   - H.264 Baseline video track, no audio
//   - Constant frame rate (e.g. 30 fps)
//   - keyint=30 — keyframe every 30 frames (1 second at 30 fps)
//   - fMP4 container (frag_keyframe+empty_moov)
//
// MP4Box.js is loaded as a side-effect import; it attaches itself to
// globalThis.MP4Box. Include it in your HTML or bundle before this module.

declare const MP4Box: any; // provided by mp4box.js

export interface DemuxConfig {
    /** Called once when the codec config is available (from the moov box). */
    onConfig(config: VideoDecoderConfig): void;
    /** Called for each encoded video chunk in decode order. */
    onChunk(chunk: EncodedVideoChunk): void;
    /** Called when the entire file has been demuxed. */
    onDone(): void;
    /** Called on unrecoverable error. */
    onError(e: Error): void;
}

export class MP4Demuxer {
    private file: any;           // MP4Box.File
    private offset = 0;          // byte offset for appendBuffer
    private readonly cfg: DemuxConfig;

    constructor(cfg: DemuxConfig) {
        this.cfg = cfg;
        this.file = MP4Box.createFile();

        this.file.onReady = (info: any) => {
            // Find the first video track
            const track = info.tracks.find((t: any) => t.type === "video");
            if (!track) { this.cfg.onError(new Error("No video track found")); return; }

            // Build VideoDecoderConfig from the avcC / hvcC box
            const trak   = this.file.getTrackById(track.id);
            const avcBox = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC;

            if (!avcBox) { this.cfg.onError(new Error("avcC box not found — is this H.264?")); return; }

            // Reconstruct the AVCDecoderConfigurationRecord as Uint8Array
            const description = this.buildAVCDescription(avcBox);

            this.cfg.onConfig({
                codec:            track.codec,          // e.g. "avc1.42001e"
                codedWidth:       track.video.width,
                codedHeight:      track.video.height,
                description,
            });

            // Start extraction — MP4Box will call onSamples per chunk
            this.file.setExtractionOptions(track.id, null, { nbSamples: 1 });
            this.file.start();
        };

        this.file.onSamples = (_id: number, _user: any, samples: any[]) => {
            for (const sample of samples) {
                const chunk = new EncodedVideoChunk({
                    type:      sample.is_sync ? "key" : "delta",
                    timestamp: (sample.cts * 1_000_000) / sample.timescale, // → microseconds
                    duration:  (sample.duration * 1_000_000) / sample.timescale,
                    data:      sample.data,
                });
                this.cfg.onChunk(chunk);
            }
        };

        this.file.onFlush = () => this.cfg.onDone();
    }

    /** Feed raw bytes from fetch response. Call repeatedly as data arrives. */
    push(buffer: ArrayBuffer): void {
        // MP4Box requires an explicit fileStart property on each buffer
        (buffer as any).fileStart = this.offset;
        this.offset += buffer.byteLength;
        this.file.appendBuffer(buffer);
        this.file.flush();
    }

    /** Fetch a URL and pipe it through the demuxer. */
    static async fromURL(url: string, cfg: DemuxConfig): Promise<MP4Demuxer> {
        const demuxer  = new MP4Demuxer(cfg);
        const response = await fetch(url);
        if (!response.ok || !response.body) {
            throw new Error(`Fetch failed: ${response.status} ${url}`);
        }

        const reader = response.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            demuxer.push(value.buffer);
        }
        return demuxer;
    }

    // ── Private ────────────────────────────────────────────────────────────

    /**
     * Reconstruct the raw AVCDecoderConfigurationRecord from the avcC box.
     * VideoDecoder needs this as the `description` field of VideoDecoderConfig.
     */
    private buildAVCDescription(avcC: any): Uint8Array {
        // avcC box from MP4Box already contains the raw bytes we need
        if (avcC.data) return new Uint8Array(avcC.data);

        // Fallback: manually pack the record
        const sps  = avcC.SPS?.[0]?.nalu ?? new Uint8Array(0);
        const pps  = avcC.PPS?.[0]?.nalu ?? new Uint8Array(0);
        const buf  = new Uint8Array(7 + 2 + sps.byteLength + 2 + pps.byteLength);
        let   pos  = 0;

        buf[pos++] = 1;               // configurationVersion
        buf[pos++] = sps[1] ?? 0x42; // AVCProfileIndication
        buf[pos++] = sps[2] ?? 0x00; // profile_compatibility
        buf[pos++] = sps[3] ?? 0x1e; // AVCLevelIndication
        buf[pos++] = 0xff;            // lengthSizeMinusOne = 3
        buf[pos++] = 0xe1;            // numSequenceParameterSets = 1

        buf[pos++] = (sps.byteLength >> 8) & 0xff;
        buf[pos++] =  sps.byteLength       & 0xff;
        buf.set(sps, pos); pos += sps.byteLength;

        buf[pos++] = 1;               // numPictureParameterSets = 1
        buf[pos++] = (pps.byteLength >> 8) & 0xff;
        buf[pos++] =  pps.byteLength       & 0xff;
        buf.set(pps, pos);

        return buf;
    }
}
