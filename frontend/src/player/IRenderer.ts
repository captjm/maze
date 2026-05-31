// src/player/IRenderer.ts
//
// VideoFrame | null — null means the decoder hasn't produced a frame yet;
// the renderer should skip the upload and keep the previous texture.

export interface IRenderer {
    render(
        primary:   VideoFrame | null,
        secondary: VideoFrame | null,
        blend:     number
    ): void;
}
