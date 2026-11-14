"""Thin wrappers around the ffmpeg / ffprobe binaries."""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path

from ..config import settings


class FFmpegError(RuntimeError):
    """Raised when an ffmpeg/ffprobe invocation fails."""


def ffmpeg_bin() -> str:
    return shutil.which("ffmpeg") or "ffmpeg"


def ffprobe_bin() -> str:
    return shutil.which("ffprobe") or "ffprobe"


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


async def _run(cmd: list[str], timeout: int = 3600) -> tuple[int, str, str]:
    def _sync_run():
        res = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return (
            res.returncode or 0,
            res.stdout.decode("utf-8", "replace"),
            res.stderr.decode("utf-8", "replace"),
        )

    try:
        return await asyncio.to_thread(_sync_run)
    except subprocess.TimeoutExpired:
        raise FFmpegError(f"ffmpeg timed out after {timeout}s")


async def run_ffmpeg(args: list[str], timeout: int = 3600) -> tuple[int, str, str]:
    """Run ffmpeg with the given arguments (no input/output boilerplate)."""
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-nostats", "-v", "error", "-y", *args]
    return await _run(cmd, timeout=timeout)


async def probe(path: str | Path) -> dict:
    """Return stream/format metadata for a media file."""
    cmd = [
        ffprobe_bin(),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    code, out, err = await _run(cmd, timeout=120)
    if code != 0:
        raise FFmpegError(f"ffprobe failed: {err.strip()[:800]}")
    return json.loads(out or "{}")


async def video_info(path: str | Path) -> dict:
    """Extract duration, resolution and fps from a video file."""
    data = await probe(path)
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    if not video:
        raise FFmpegError("No video stream found in the uploaded file.")

    duration = 0.0
    for src in (video.get("duration"), data.get("format", {}).get("duration")):
        try:
            duration = float(src)
            break
        except (TypeError, ValueError):
            continue

    fps = 0.0
    for raw in (video.get("avg_frame_rate"), video.get("r_frame_rate")):
        try:
            num, _, den = raw.partition("/")
            if float(den) != 0:
                fps = float(num) / float(den)
                break
        except (TypeError, ValueError, ZeroDivisionError):
            continue

    return {
        "duration": round(max(duration, 0.0), 3),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "fps": round(fps, 3),
    }


async def extract_thumbnails(
    video_path: str | Path, out_dir: str | Path, count: int = 12, width: int = 160
) -> list[str]:
    """Write a filmstrip of evenly spaced frames and return the file names."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("thumb_*.jpg"):
        stale.unlink(missing_ok=True)

    info = await video_info(video_path)
    duration = max(info["duration"], 0.1)

    async def _extract_one(i: int):
        t = duration * (i + 0.5) / count
        t = max(0.0, min(t, duration - 0.02))
        name = f"thumb_{i:02d}.jpg"
        dest = out_dir / name
        code, _, _ = await run_ffmpeg(
            [
                "-ss",
                f"{t:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                f"scale={width}:-2:force_original_aspect_ratio=decrease",
                "-q:v",
                "5",
                str(dest),
            ],
            timeout=30,
        )
        if code == 0 and dest.exists():
            return name
        return None

    results = await asyncio.gather(*[_extract_one(i) for i in range(count)])
    return [r for r in results if r]


async def trim_video(
    src: str | Path, dest: str | Path, start: float, end: float
) -> tuple[int, str, str]:
    """Cut [start, end) out of the source and re-encode to H.264."""
    src_p = Path(src).resolve()
    dest_p = Path(dest).resolve()
    same_file = False
    try:
        same_file = src_p.is_file() and dest_p.is_file() and src_p.samefile(dest_p)
    except Exception:
        same_file = str(src_p).lower() == str(dest_p).lower()

    if same_file or str(src_p).lower() == str(dest_p).lower():
        actual_dest = dest_p.with_name(f"{dest_p.stem}_tmp_{uuid.uuid4().hex[:6]}{dest_p.suffix}")
        is_temp = True
    else:
        actual_dest = dest_p
        is_temp = False

    duration = max(end - start, 0.1)
    code, out, err = await run_ffmpeg(
        [
            "-ss",
            f"{max(start, 0):.3f}",
            "-i",
            str(src_p),
            "-t",
            f"{duration:.3f}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-threads",
            "0",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(actual_dest),
        ],
        timeout=1800,
    )
    if code == 0 and is_temp and actual_dest.is_file():
        try:
            os.replace(str(actual_dest), str(dest_p))
        except Exception:
            try:
                dest_p.unlink(missing_ok=True)
                shutil.move(str(actual_dest), str(dest_p))
            except Exception:
                pass
    elif code != 0 and is_temp and actual_dest.is_file():
        actual_dest.unlink(missing_ok=True)

    return code, out, err


async def cut_and_concat_video(
    src: str | Path, dest: str | Path, kept_ranges: list[tuple[float, float]]
) -> tuple[int, str, str]:
    """Cut multiple [start, end) ranges out of source and concatenate them into dest."""
    if not kept_ranges:
        return -1, "", "No ranges to cut."
    if len(kept_ranges) == 1:
        return await trim_video(src, dest, kept_ranges[0][0], kept_ranges[0][1])

    src_p = Path(src).resolve()
    dest_p = Path(dest).resolve()
    same_file = False
    try:
        same_file = src_p.is_file() and dest_p.is_file() and src_p.samefile(dest_p)
    except Exception:
        same_file = str(src_p).lower() == str(dest_p).lower()

    if same_file or str(src_p).lower() == str(dest_p).lower():
        actual_dest = dest_p.with_name(f"{dest_p.stem}_tmp_{uuid.uuid4().hex[:6]}{dest_p.suffix}")
        is_temp = True
    else:
        actual_dest = dest_p
        is_temp = False

    # Check whether the input video has an audio stream
    has_audio = True
    try:
        data = await probe(src_p)
        has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))
    except Exception:
        has_audio = True

    filter_lines = []
    concat_inputs = []

    for i, (start, end) in enumerate(kept_ranges):
        s_sec = max(0.0, start)
        e_sec = max(s_sec + 0.1, end)
        filter_lines.append(f"[0:v]trim=start={s_sec:.3f}:end={e_sec:.3f},setpts=PTS-STARTPTS[v{i}]")
        concat_inputs.append(f"[v{i}]")
        if has_audio:
            filter_lines.append(f"[0:a]atrim=start={s_sec:.3f}:end={e_sec:.3f},asetpts=PTS-STARTPTS[a{i}]")
            concat_inputs.append(f"[a{i}]")

    a_flag = 1 if has_audio else 0
    out_a = "[outa]" if has_audio else ""
    concat_filter = f"{''.join(concat_inputs)}concat=n={len(kept_ranges)}:v=1:a={a_flag}[outv]{out_a}"
    filter_complex = "; ".join(filter_lines) + "; " + concat_filter

    args = [
        "-i",
        str(src_p),
        "-filter_complex",
        filter_complex,
        "-map",
        "[outv]",
    ]
    if has_audio:
        args.extend(["-map", "[outa]"])

    args.extend([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-threads",
        "0",
        "-pix_fmt",
        "yuv420p",
    ])
    if has_audio:
        args.extend([
            "-c:a",
            "aac",
            "-b:a",
            "192k",
        ])

    args.extend([
        "-movflags",
        "+faststart",
        str(actual_dest),
    ])

    code, out, err = await run_ffmpeg(args, timeout=1800)
    if code == 0 and is_temp and actual_dest.is_file():
        try:
            os.replace(str(actual_dest), str(dest_p))
        except Exception:
            try:
                dest_p.unlink(missing_ok=True)
                shutil.move(str(actual_dest), str(dest_p))
            except Exception:
                pass
    elif code != 0 and is_temp and actual_dest.is_file():
        actual_dest.unlink(missing_ok=True)

    return code, out, err



_SRT_TIME = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")


def _ass_time(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        cs, s = 0, s + 1
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def _escape_ass(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", "\\N")
    )


def format_viral_cue_text(
    raw_text: str, highlight_hex: str = "E5252A", uppercase: bool = True
) -> str:
    """Format subtitle text for viral reel impact.

    Splits text into 2-3 punchy lines if needed, and applies accent color
    to the secondary line (matching Vaibhav Venture and Vone Digitals reels).
    """
    raw_text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    if len(lines) <= 1:
        words = raw_text.strip().split()
        if len(words) >= 6:
            mid = len(words) // 2
            lines = [" ".join(words[:mid]), " ".join(words[mid:])]
        else:
            lines = [raw_text.strip()]

    if uppercase:
        lines = [l.upper() for l in lines]

    # Convert RGB hex to BGR hex for ASS format (&HBBGGRR&)
    hl_clean = highlight_hex.lstrip("#")
    if len(hl_clean) == 6:
        r, g, b = hl_clean[0:2], hl_clean[2:4], hl_clean[4:6]
        hl_bgr = f"&H{b.upper()}{g.upper()}{r.upper()}&"
    else:
        hl_bgr = "&H2A25E5&"

    formatted_lines = []
    for idx, line in enumerate(lines):
        is_highlight = (len(lines) == 2 and idx == 1) or (len(lines) >= 3 and idx == 1)
        esc_line = _escape_ass(line)
        if is_highlight:
            formatted_lines.append(f"{{\\c{hl_bgr}}}{esc_line}{{\\c&HFFFFFF&}}")
        else:
            formatted_lines.append(esc_line)

    return "\\N".join(formatted_lines)


def build_ass(
    cues: list[dict],
    font: str = "Inter",
    size: int = 58,
    color: str = "FFFFFF",
    outline_color: str = "000000",
    margin_v: int = 140,
    outline: int = 4,
    shadow: int = 1,
    bold: bool = True,
    uppercase: bool = True,
    boxed: bool = False,
    highlight_color: str = "E5252A",
    brand_tag: str | None = None,
    effects: list[dict] | None = None,
) -> str:
    """Render an ASS subtitle document with a bold, readable style.

    Supports viral reel boxed pill captions (like Vaibhav & Vone reels),
    automatic Telugu/Indic font selection (Nirmala UI), and collision avoidance:
    subtitles automatically float to the TOP during templates that occupy the bottom.
    """
    # Check if text contains Indic characters (Telugu, Hindi, Tamil, Kannada, Malayalam, etc.)
    has_indic = any(
        any(0x0900 <= ord(ch) <= 0x0D7F for ch in cue.get("text", ""))
        for cue in cues
    )
    if has_indic and font in ("Inter", "Arial", "Impact", "Montserrat", "Verdana", "Trebuchet MS"):
        font = "Nirmala UI"

    # Identify effects with bottom UI where subtitles would collide
    bottom_effects = {
        "check-pills",
        "pastel-word",
        "timeline",
        "red-timeline",
        "the-bill",
        "phone-fan",
        "profile-wall",
        "messages",
        "apple-toggles",
        "todo",
        "comment-box",
        "reel-frame",
        "tap",
        "uninstall",
        "broll-split",
        "tier-list",
    }
    bottom_windows = [
        (float(e.get("start", 0)), float(e.get("end", 0)))
        for e in (effects or [])
        if e.get("fx") in bottom_effects
    ]

    primary = f"&H00{color.upper().lstrip('#')}&"
    bold_flag = -1 if bold else 0

    if boxed:
        border_style = 3
        outline_val = 14
        shadow_val = 0
        back = "&H00101010&"
    else:
        border_style = 1
        outline_val = outline or 4
        shadow_val = shadow or 2
        back = f"&H00{outline_color.upper().lstrip('#')}&"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{size},{primary},{primary},{back},{back},{bold_flag},0,0,0,100,100,0,0,{border_style},{outline_val},{shadow_val},2,60,60,{margin_v},1
Style: TopStyle,{font},{size},{primary},{primary},{back},{back},{bold_flag},0,0,0,100,100,0,0,{border_style},{outline_val},{shadow_val},8,60,60,140,1
Style: BrandBadge,Arial,34,&H00E5252A&,&H00E5252A&,&H40000000&,&H40000000&,-1,0,0,0,100,100,2,0,3,10,0,2,60,60,160,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]

    # Add REC brand watermark badge if specified
    if brand_tag and brand_tag.strip():
        max_end = max([float(c.get("end", 0.0)) for c in cues] + [30.0])
        safe_brand = _escape_ass(brand_tag.strip().upper())
        lines.append(
            f"Dialogue: 0,0:00:00.00,{_ass_time(max_end)},BrandBadge,,0,0,0,,{{\\c&H2A25E5&}}● REC{{\\c&HFFFFFF&}}   •   {safe_brand}\n"
        )

    for cue in cues:
        raw_text = cue.get("text", "").strip()
        if not raw_text:
            continue
        c_start = float(cue.get("start", 0.0))
        c_end = float(cue.get("end", 0.0))
        overlaps_bottom = any(
            not (c_end <= b_start or c_start >= b_end)
            for b_start, b_end in bottom_windows
        )
        style_name = "TopStyle" if overlaps_bottom else "Default"
        formatted_text = format_viral_cue_text(
            raw_text, highlight_hex=highlight_color, uppercase=uppercase
        )
        start = _ass_time(cue["start"])
        end = _ass_time(cue["end"])
        lines.append(f"Dialogue: 1,{start},{end},{style_name},,0,0,0,,{formatted_text}\n")
    return "".join(lines)


async def burn_subtitles(
    video: str | Path, ass_path: str | Path, dest: str | Path
) -> tuple[int, str, str]:
    """Burn an ASS subtitle file into the video (crf 17 keeps text crisp)."""
    ass_path_str = Path(ass_path).as_posix().replace(":", "\\:")
    fonts_dir = (Path(settings.effects_path) / "fonts").as_posix().replace(":", "\\:")
    vf_arg = f"subtitles='{ass_path_str}':fontsdir='{fonts_dir}'"
    return await run_ffmpeg(
        [
            "-i",
            str(video),
            "-vf",
            vf_arg,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(dest),
        ],
        timeout=1800,
    )




def workspace_for(project_id: int) -> Path:
    """Per-project scratch directory used for renders, plans and temp media."""
    path = settings.renders_dir / f"project_{project_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_dir(user_id: int) -> Path:
    path = settings.upload_dir / f"user_{user_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_images_dir(project_id: int) -> Path:
    path = settings.images_dir / f"project_{project_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def auto_extract_video_cards(
    video_path: str | Path,
    out_dir: str | Path,
    count: int = 6,
    width: int = 1080,
) -> list[Path]:
    """Auto-extract evenly spaced high-resolution snapshot frames from the video
    to serve as cards/covers for image-based templates when user hasn't uploaded custom images.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    info = await video_info(video_path)
    duration = max(float(info.get("duration", 10.0)), 1.0)

    extracted: list[Path] = []
    for i in range(count):
        t = duration * (i + 0.5) / count
        dest = out_dir / f"auto_card_{i+1:02d}.jpg"
        code, _, _ = await run_ffmpeg(
            [
                "-ss",
                f"{t:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                f"scale={width}:-2",
                "-q:v",
                "2",
                str(dest),
            ],
            timeout=30,
        )
        if code == 0 and dest.is_file():
            extracted.append(dest)
    return extracted
