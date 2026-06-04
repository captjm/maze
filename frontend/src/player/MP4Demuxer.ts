// src/player/MP4Demuxer.ts
declare const MP4Box: any;

export interface DemuxConfig {
    onConfig(config: VideoDecoderConfig): void;
    onChunk(chunk: EncodedVideoChunk): void;
    onDone(): void;
    onError(e: Error): void;
}

export class MP4Demuxer {
    private file:   any;
    private offset = 0;

    constructor(cfg: DemuxConfig) {
        this.file = MP4Box.createFile();

        this.file.onReady = (info: any) => {
            const track = info.videoTracks?.[0] ?? info.tracks?.find((t: any) => t.type === "video");
            if (!track) {
                cfg.onError(new Error("No video track in file"));
                return;
            }

            // Build VideoDecoderConfig
            const description = this.extractAVCDescription(track.id);
            if (!description) {
                cfg.onError(new Error("Cannot extract avcC — file must be H.264"));
                return;
            }

            cfg.onConfig({
                codec:       track.codec,
                codedWidth:  track.video.width,
                codedHeight: track.video.height,
                description,
            });

            this.file.setExtractionOptions(track.id, null, { nbSamples: 100 });
            this.file.start();
        };

        this.file.onSamples = (_id: number, _user: any, samples: any[]) => {
            for (const s of samples) {
                cfg.onChunk(new EncodedVideoChunk({
                    type:      s.is_sync ? "key" : "delta",
                    // CTS (composition timestamp) → microseconds
                    timestamp: Math.round((s.cts  * 1_000_000) / s.timescale),
                    duration:  Math.round((s.duration * 1_000_000) / s.timescale),
                    data:      s.data,
                }));
            }
        };

        this.file.onFlush = () => cfg.onDone();

        this.file.onError = (e: any) => cfg.onError(new Error(String(e)));
    }

    push(buffer: ArrayBuffer): void {
        (buffer as any).fileStart = this.offset;
        this.offset += buffer.byteLength;
        this.file.appendBuffer(buffer);
        this.file.flush();
    }

    static async fromURL(url: string, cfg: DemuxConfig): Promise<void> {
        const demuxer  = new MP4Demuxer(cfg);
        const response = await fetch(url);
        if (!response.ok || !response.body) {
            throw new Error(`Fetch ${url} failed: ${response.status}`);
        }
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            demuxer.push(value.buffer);
        }
    }

    // ── Private ────────────────────────────────────────────────────────────

    private extractAVCDescription(trackId: number): Uint8Array | null {
        try {
            // MP4Box stores the raw avcC box bytes in trak.mdia.minf.stbl.stsd
            const trak = this.file.getTrackById(trackId);
            const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];

            // Prefer raw data if available
            const avcC = entry?.avcC;
            if (!avcC) return null;

            if (avcC.data) return new Uint8Array(avcC.data);

            // Manually reconstruct AVCDecoderConfigurationRecord
            const sps = avcC.SPS?.[0]?.nalu;
            const pps = avcC.PPS?.[0]?.nalu;
            if (!sps || !pps) return null;

            const out = new Uint8Array(7 + 2 + sps.length + 2 + pps.length);
            let i = 0;
            out[i++] = 1;          // configurationVersion
            out[i++] = sps[1];     // AVCProfileIndication
            out[i++] = sps[2];     // profile_compatibility
            out[i++] = sps[3];     // AVCLevelIndication
            out[i++] = 0xff;       // lengthSizeMinusOne = 3
            out[i++] = 0xe1;       // numSPS = 1
            out[i++] = (sps.length >> 8) & 0xff;
            out[i++] =  sps.length       & 0xff;
            out.set(sps, i); i += sps.length;
            out[i++] = 1;          // numPPS = 1
            out[i++] = (pps.length >> 8) & 0xff;
            out[i++] =  pps.length       & 0xff;
            out.set(pps, i);
            return out;
        } catch {
            return null;
        }
    }
}