// src/player/WebGLRenderer.ts
//
// Renders two VideoFrames into a full-screen WebGL quad with a crossfade shader.
// VideoFrame is uploaded directly to a GPU texture via texImage2D — no CPU copy.
//
// Null frame → skip texture upload, keep previous texture content.
// This handles the brief moment at startup / after SWAP when a decoder
// hasn't produced its first frame yet.

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
    attribute vec2 aPosition;
    varying   vec2 vUv;

    void main() {
        // NDC [-1,1] → UV [0,1]; flip Y — WebGL origin is bottom-left,
        // VideoFrame origin is top-left.
        vUv = vec2(
            aPosition.x * 0.5 + 0.5,
            1.0 - (aPosition.y * 0.5 + 0.5)
        );
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const FRAG = /* glsl */ `
    precision mediump float;

    uniform sampler2D uPrimary;
    uniform sampler2D uSecondary;
    uniform float     uBlend;

    varying vec2 vUv;

    void main() {
        vec4 a = texture2D(uPrimary,   vUv);
        vec4 b = texture2D(uSecondary, vUv);
        gl_FragColor = mix(a, b, uBlend);
    }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function createProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
    const p = gl.createProgram()!;
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER,   vert));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(`Program link: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
}

// ── WebGLRenderer ─────────────────────────────────────────────────────────────

export class WebGLRenderer {
    private readonly canvas:  HTMLCanvasElement;
    private readonly gl:      WebGLRenderingContext;
    private readonly program: WebGLProgram;

    private readonly uPrimary:   WebGLUniformLocation;
    private readonly uSecondary: WebGLUniformLocation;
    private readonly uBlend:     WebGLUniformLocation;

    private readonly texPrimary:   WebGLTexture;
    private readonly texSecondary: WebGLTexture;

    private lastW = 0;
    private lastH = 0;

    constructor() {
        this.canvas = document.getElementById("canvas") as HTMLCanvasElement;

        const gl = this.canvas.getContext("webgl", {
            alpha:     false,
            depth:     false,
            stencil:   false,
            antialias: false,
        });
        if (!gl) throw new Error("WebGL not supported");
        this.gl = gl;

        this.program = createProgram(gl, VERT, FRAG);
        gl.useProgram(this.program);

        // Full-screen quad — two triangles in NDC space
        const verts = new Float32Array([
            -1, -1,   1, -1,  -1,  1,
            -1,  1,   1, -1,   1,  1,
        ]);
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(this.program, "aPosition");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        this.uPrimary   = gl.getUniformLocation(this.program, "uPrimary")!;
        this.uSecondary = gl.getUniformLocation(this.program, "uSecondary")!;
        this.uBlend     = gl.getUniformLocation(this.program, "uBlend")!;

        gl.uniform1i(this.uPrimary,   0);
        gl.uniform1i(this.uSecondary, 1);

        gl.activeTexture(gl.TEXTURE0);
        this.texPrimary = createTexture(gl);

        gl.activeTexture(gl.TEXTURE1);
        this.texSecondary = createTexture(gl);
    }

    render(primary: VideoFrame | null, secondary: VideoFrame | null, blend: number): void {
        const gl = this.gl;
        const w  = window.innerWidth;
        const h  = window.innerHeight;

        if (w !== this.lastW || h !== this.lastH) {
            this.canvas.width  = w;
            this.canvas.height = h;
            gl.viewport(0, 0, w, h);
            // Resize resets all GL state — restore program and sampler bindings
            gl.useProgram(this.program);
            gl.uniform1i(this.uPrimary,   0);
            gl.uniform1i(this.uSecondary, 1);
            this.lastW = w;
            this.lastH = h;
        }

        // Upload VideoFrame directly — zero CPU copy path
        if (primary !== null) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texPrimary);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, primary as any);
        }

        if (blend > 0 && secondary !== null) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.texSecondary);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, secondary as any);
        }

        gl.uniform1f(this.uBlend, blend);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
