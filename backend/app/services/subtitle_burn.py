"""Subtitle burning: build an ASS file and mux it into the render."""
from __future__ import annotations

import re
from pathlib import Path

from ..config import settings
from .ffmpeg_service import burn_subtitles, build_ass


def smooth_and_bridge_cues(cues: list[dict]) -> list[dict]:
    """Ensure subtitle cues have proper human-readable duration, no micro-flicker,
    gap bridging, and auto-split oversized 5s+ chunks into balanced 2-line cards.
    """
    if not cues:
        return []

    sorted_cues = sorted(cues, key=lambda c: float(c.get("start", 0.0)))
    expanded = []

    # Step 1: Split any oversized blocks (> 5.2s with >= 10 words)
    for c in sorted_cues:
        s_t = float(c.get("start", 0.0))
        e_t = float(c.get("end", s_t + 1.0))
        text = str(c.get("text", "")).strip()
        dur = e_t - s_t
        words = text.split()

        if dur > 5.2 and len(words) >= 10:
            sentences = re.split(r"(?<=[.!?])\s+", text)
            if len(sentences) == 2 and len(sentences[0].split()) >= 3 and len(sentences[1].split()) >= 3:
                p1_words = len(sentences[0].split())
                frac = p1_words / max(1, len(words))
                mid = s_t + dur * frac
                expanded.append({"start": s_t, "end": round(mid - 0.05, 3), "text": sentences[0].strip()})
                expanded.append({"start": round(mid, 3), "end": e_t, "text": sentences[1].strip()})
            else:
                mid_idx = len(words) // 2
                mid = s_t + dur * (mid_idx / len(words))
                expanded.append({"start": s_t, "end": round(mid - 0.05, 3), "text": " ".join(words[:mid_idx])})
                expanded.append({"start": round(mid, 3), "end": e_t, "text": " ".join(words[mid_idx:])})
        else:
            expanded.append({"start": s_t, "end": e_t, "text": text})

    # Step 2: Ensure minimum readable duration and bridge awkward gaps
    result = []
    for i, c in enumerate(expanded):
        s_t = float(c["start"])
        e_t = float(c["end"])
        text = c["text"].strip()
        words = text.split()
        word_count = len(words)

        # Minimum reading duration: at least 1.6s, or word_count * 0.32s
        min_reading = max(1.6, min(5.0, word_count * 0.32))
        if e_t - s_t < min_reading:
            e_t = s_t + min_reading

        # Bridge gaps if next cue starts within 2.2s
        if i + 1 < len(expanded):
            next_start = float(expanded[i + 1]["start"])
            if e_t >= next_start:
                e_t = max(s_t + 0.6, next_start - 0.05)
            elif next_start - e_t <= 2.2:
                e_t = next_start - 0.05

        result.append({
            "start": round(s_t, 3),
            "end": round(e_t, 3),
            "text": text,
        })

    return result


def write_ass_file(
    cues: list[dict],
    path: str | Path,
    font: str = "Inter",
    size: int = 58,
    color: str = "FFFFFF",
    outline_color: str = "000000",
    bold: bool = True,
    uppercase: bool = True,
    boxed: bool = False,
    highlight_color: str = "E5252A",
    brand_tag: str | None = None,
    effects: list[dict] | None = None,
) -> Path:
    """Write an ASS subtitle file (UTF-8, no BOM - libass reads it fine)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ass = build_ass(
        cues,
        font=font,
        size=size,
        color=color,
        outline_color=outline_color,
        bold=bold,
        uppercase=uppercase,
        boxed=boxed,
        highlight_color=highlight_color,
        brand_tag=brand_tag,
        effects=effects,
    )
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(ass)
    return path


async def burn(
    video: str | Path,
    cues: list[dict],
    dest: str | Path,
    font: str = "Inter",
    size: int = 58,
    color: str = "FFFFFF",
    outline_color: str = "000000",
    bold: bool = True,
    uppercase: bool = True,
    boxed: bool = False,
    highlight_color: str = "E5252A",
    brand_tag: str | None = None,
    effects: list[dict] | None = None,
) -> tuple[bool, str]:
    """Burn subtitles into a rendered video.

    Returns ``(ok, message)``; on failure the original video is untouched.
    """
    usable = [c for c in cues if c.get("text", "").strip()]
    usable = smooth_and_bridge_cues(usable)
    if not usable and not brand_tag:
        return True, "No subtitles to burn."

    ass_path = Path(dest).with_suffix(".ass")
    write_ass_file(
        usable,
        ass_path,
        font=font,
        size=size,
        color=color,
        outline_color=outline_color,
        bold=bold,
        uppercase=uppercase,
        boxed=boxed,
        highlight_color=highlight_color,
        brand_tag=brand_tag,
        effects=effects,
    )
    code, _out, err = await burn_subtitles(video, ass_path, dest)
    if code != 0:
        return False, (err or "ffmpeg failed to burn subtitles").strip()[-3000:]
    return True, "Subtitles burned in."


def ass_path_for(project_id: int, job_id: int) -> Path:
    return settings.subtitles_dir / f"project_{project_id}" / f"job_{job_id}.ass"
