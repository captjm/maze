#!/usr/bin/env bash
# prepare-video.sh — Maze video preparation pipeline
#
# Converts input video files to fMP4 / H.264 Baseline optimised for
# the Maze WebCodecs player:
#   - Constant frame rate
#   - keyint = fps  →  one keyframe per second  (seek-safe at 1s boundary)
#   - H.264 Baseline Profile, no B-frames
#   - Fragmented MP4 (fMP4) — required for fetch-based demuxing
#   - No audio track
#
# Usage:
#   ./prepare-video.sh [OPTIONS] <input> [<input2> ...]
#
# Options:
#   -o, --output-dir  DIR      Output directory            (default: ./out)
#   -r, --fps         NUMBER   Output frame rate           (default: 30)
#   -s, --size        WxH      Output resolution e.g. 1920x1080
#                              Scales with letterbox/pillarbox padding
#                              If omitted, keeps source resolution
#   -a, --aspect      W:H      Enforce aspect ratio with padding e.g. 16:9
#                              Ignored when --size is given
#   -q, --crf         NUMBER   CRF quality 0-51, lower = better (default: 23)
#   -p, --preset      PRESET   libx264 preset              (default: medium)
#   -j, --jobs        NUMBER   Parallel encodes            (default: 1)
#   -n, --dry-run              Print ffmpeg commands, do not run
#   -h, --help                 Show this help
#
# Examples:
#   # Single file, 1080p 30fps
#   ./prepare-video.sh -s 1920x1080 input.mp4
#
#   # Multiple files, 720p 24fps, high quality
#   ./prepare-video.sh -s 1280x720 -r 24 -q 18 clip1.mp4 clip2.mp4 clip3.mp4
#
#   # Keep source resolution, enforce 16:9 with letterbox padding
#   ./prepare-video.sh -a 16:9 input.mp4
#
#   # Batch encode a folder, 4 parallel jobs
#   ./prepare-video.sh -j 4 -s 1920x1080 footage/*.mp4
#
# Output filenames mirror the input basenames with .mp4 extension.
# Existing output files are skipped automatically.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

OUTPUT_DIR="./out"
FPS=30
SIZE=""
ASPECT=""
CRF=23
PRESET="medium"
JOBS=1
DRY_RUN=0
INPUTS=()

# ── Colours (disabled when stdout is not a tty) ───────────────────────────────

if [ -t 2 ]; then
    RED='\033[0;31m'; YELLOW='\033[1;33m'
    GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
else
    RED=''; YELLOW=''; GREEN=''; CYAN=''; RESET=''
fi

info()  { printf "${CYAN}[maze]${RESET} %s\n"  "$*" >&2; }
ok()    { printf "${GREEN}[maze]${RESET} %s\n"  "$*" >&2; }
warn()  { printf "${YELLOW}[maze]${RESET} %s\n" "$*" >&2; }
error() { printf "${RED}[maze]${RESET} %s\n"   "$*" >&2; }
die()   { error "$*"; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        -o|--output-dir) OUTPUT_DIR="$2"; shift 2 ;;
        -r|--fps)        FPS="$2";        shift 2 ;;
        -s|--size)       SIZE="$2";       shift 2 ;;
        -a|--aspect)     ASPECT="$2";     shift 2 ;;
        -q|--crf)        CRF="$2";        shift 2 ;;
        -p|--preset)     PRESET="$2";     shift 2 ;;
        -j|--jobs)       JOBS="$2";       shift 2 ;;
        -n|--dry-run)    DRY_RUN=1;       shift   ;;
        -h|--help)
            sed -n '/^# Usage:/,/^[^#]/{/^#/{s/^# \{0,1\}//;p};/^[^#]/q}' "$0"
            exit 0 ;;
        -*) die "Unknown option: $1. Use -h for help." ;;
        *)  INPUTS+=("$1"); shift ;;
    esac
done

# ── Validation ────────────────────────────────────────────────────────────────

[[ ${#INPUTS[@]} -eq 0 ]] && die "No input files specified. Use -h for help."

command -v ffmpeg  >/dev/null 2>&1 || die "ffmpeg not found in PATH"
command -v ffprobe >/dev/null 2>&1 || die "ffprobe not found in PATH"

[[ "$FPS" =~ ^[0-9]+(\.[0-9]+)?$ ]]  || die "--fps must be a positive number, got: $FPS"
[[ "$CRF" =~ ^[0-9]+$ ]] && (( CRF <= 51 )) || die "--crf must be 0–51, got: $CRF"
[[ "$JOBS" =~ ^[0-9]+$ ]] && (( JOBS >= 1 )) || die "--jobs must be a positive integer, got: $JOBS"

if [[ -n "$SIZE" ]]; then
    [[ "$SIZE" =~ ^[0-9]+x[0-9]+$ ]] \
        || die "--size must be WxH (e.g. 1920x1080), got: $SIZE"
fi

if [[ -n "$ASPECT" ]]; then
    [[ "$ASPECT" =~ ^[0-9]+:[0-9]+$ ]] \
        || die "--aspect must be W:H (e.g. 16:9), got: $ASPECT"
    [[ -n "$SIZE" ]] && warn "--aspect is ignored when --size is given"
fi

VALID_PRESETS="ultrafast superfast veryfast faster fast medium slow slower veryslow"
[[ " $VALID_PRESETS " == *" $PRESET "* ]] \
    || die "--preset must be one of: $VALID_PRESETS"

# ── Derived parameters ────────────────────────────────────────────────────────

# keyint = ceil(fps) → one keyframe per second, aligned to 1s boundary
# This is the core requirement for the Maze WebCodecs seek model.
KEYINT=$(awk "BEGIN { printf \"%d\", int($FPS + 0.9999) }")

# fMP4 flags required for fetch-based streaming demux
FRAG_FLAGS="frag_keyframe+empty_moov+default_base_moof"

# ── Video filter chain ────────────────────────────────────────────────────────

# Builds the -vf argument for a given input file.
# Order matters: scale → pad → enforce even dimensions → fps.
build_vf() {
    local parts=()

    if [[ -n "$SIZE" ]]; then
        # Scale to fit inside WxH, then pad to exact WxH with black bars
        local w="${SIZE%%x*}"
        local h="${SIZE##*x}"
        parts+=("scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos")
        parts+=("pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black")

    elif [[ -n "$ASPECT" ]]; then
        # Pad source to match the given aspect ratio without rescaling
        local ar_w="${ASPECT%%:*}"
        local ar_h="${ASPECT##*:}"
        # Pad whichever axis is short to reach the target ratio
        parts+=("pad=if(gt(iw*${ar_h},ih*${ar_w}),iw,ih*${ar_w}/${ar_h}):if(gt(iw*${ar_h},ih*${ar_w}),iw*${ar_h}/${ar_w},ih):(ow-iw)/2:(oh-ih)/2:color=black")
    fi

    # H.264 requires dimensions divisible by 2
    parts+=("scale=trunc(iw/2)*2:trunc(ih/2)*2")

    # Lock to constant frame rate (duplicates or drops frames as needed)
    parts+=("fps=fps=${FPS}")

    local IFS=','
    echo "${parts[*]}"
}

# ── Probe helpers ─────────────────────────────────────────────────────────────

probe_stream() {
    # Usage: probe_stream <file> <entry>
    ffprobe -v error -select_streams v:0 \
        -show_entries "stream=$2" \
        -of default=nokey=1:noprint_wrappers=1 \
        "$1" 2>/dev/null | head -1
}

probe_format() {
    ffprobe -v error \
        -show_entries "format=$2" \
        -of default=nokey=1:noprint_wrappers=1 \
        "$1" 2>/dev/null | head -1
}

# ── Encode one file ───────────────────────────────────────────────────────────

encode_one() {
    local input="$1"
    local stem
    stem="$(basename "${input%.*}")"
    local output="${OUTPUT_DIR}/${stem}.mp4"

    if [[ -e "$output" ]]; then
        warn "Skip (exists): $output"
        return 0
    fi

    if [[ ! -f "$input" ]]; then
        error "Input not found: $input"
        return 1
    fi

    local vf
    vf="$(build_vf "$input")"

    # Print source info for reference
    local src_codec src_w src_h src_fps src_dur
    src_codec=$(probe_stream "$input" "codec_name")
    src_w=$(probe_stream "$input" "width")
    src_h=$(probe_stream "$input" "height")
    src_fps=$(probe_stream "$input" "r_frame_rate")
    src_dur=$(probe_format  "$input" "duration")

    local cmd=(
        ffmpeg
        -hide_banner
        -loglevel warning
        -stats
        -i "$input"
        -vf "$vf"
        # Codec
        -c:v libx264
        -profile:v baseline       # no B-frames, simple NAL structure
        -level:v 3.1              # supports up to 1080p@30
        # Keyframe discipline — critical for WebCodecs seek model
        -x264-params "keyint=${KEYINT}:min-keyint=${KEYINT}:scenecut=0:bframes=0"
        -crf "$CRF"
        -preset "$PRESET"
        -pix_fmt yuv420p          # maximum decoder compatibility
        # fMP4 container
        -movflags "$FRAG_FLAGS"
        # No audio
        -an
        "$output"
    )

    if [[ $DRY_RUN -eq 1 ]]; then
        printf '%q ' "${cmd[@]}"
        echo
        return 0
    fi

    info "Encoding: ${input}"
    info "  source : ${src_codec} ${src_w}x${src_h} @ ${src_fps}fps  duration=${src_dur}s"
    info "  output : ${output}"
    info "  params : fps=${FPS}  keyint=${KEYINT}  crf=${CRF}  preset=${PRESET}${SIZE:+  size=${SIZE}}${ASPECT:+  aspect=${ASPECT}}"

    if "${cmd[@]}"; then
        # Verify output
        local out_codec out_dur out_w out_h
        out_codec=$(probe_stream "$output" "codec_name")
        out_w=$(probe_stream     "$output" "width")
        out_h=$(probe_stream     "$output" "height")
        out_dur=$(probe_format   "$output" "duration")
        ok "Done: $output  [${out_codec} ${out_w}x${out_h}  ${out_dur}s]"
    else
        error "Encoding failed: $input"
        rm -f "$output"
        return 1
    fi
}

# Export everything needed by subshells (used by GNU parallel)
export -f encode_one build_vf probe_stream probe_format info ok warn error
export OUTPUT_DIR FPS SIZE ASPECT CRF PRESET KEYINT FRAG_FLAGS DRY_RUN
export RED YELLOW GREEN CYAN RESET

# ── Main ──────────────────────────────────────────────────────────────────────

mkdir -p "$OUTPUT_DIR"

info "Maze video preparation"
info "  inputs  : ${#INPUTS[@]} file(s)"
info "  output  : $OUTPUT_DIR"
info "  fps     : $FPS  (keyint = ${KEYINT} — 1 keyframe/sec)"
info "  size    : ${SIZE:-source resolution}"
info "  aspect  : ${ASPECT:-source aspect}"
info "  crf     : $CRF  (preset: $PRESET)"
info "  jobs    : $JOBS"
[[ $DRY_RUN -eq 1 ]] && warn "DRY RUN — no files will be written"
echo >&2

FAILED=0

if [[ $JOBS -gt 1 ]] && command -v parallel >/dev/null 2>&1; then
    printf '%s\n' "${INPUTS[@]}" \
        | parallel --halt soon,fail=1 -j "$JOBS" encode_one {} \
        || FAILED=1
else
    [[ $JOBS -gt 1 ]] && warn "GNU parallel not found — running sequentially"
    for input in "${INPUTS[@]}"; do
        encode_one "$input" || FAILED=1
    done
fi

echo >&2
if [[ $FAILED -eq 0 ]]; then
    ok "All done. Files are in: $OUTPUT_DIR"
else
    error "Some encodes failed — check output above."
    exit 1
fi