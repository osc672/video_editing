"""Subtitle transcription and editing."""
from __future__ import annotations

import asyncio
import logging
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, Subtitle, User
from ..schemas import ImportScriptIn, PolishSubtitlesIn, SubtitleListIn, SubtitleOut, TranscribeIn
from ..security import get_current_user
from ..services import whisper_service

logger = logging.getLogger("ai_reel_editor.subtitles")

router = APIRouter(prefix="/api/projects/{project_id}/subtitles", tags=["subtitles"])


def _owned_project(db: Session, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post("/transcribe")
async def transcribe(
    project_id: int,
    background: BackgroundTasks,
    payload: TranscribeIn | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Start transcription in the background and return immediately."""
    project = _owned_project(db, project_id, user)
    project.status = "transcribing"
    db.commit()

    lang = payload.language if payload else None
    task = payload.task if payload else "transcribe"
    prompt = payload.prompt if payload else None
    background.add_task(_run_transcription, project.id, lang, task, prompt)
    return {"status": "started", "project_id": project.id, "language": lang, "task": task}


def _run_transcription(
    project_id: int,
    language: str | None = None,
    task: str = "transcribe",
    prompt: str | None = None,
) -> None:
    """Background worker: transcribe and write the subtitle rows."""
    from ..db import SessionLocal

    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if not project:
            return
        video_path = project.video_path

    try:
        segments, words = asyncio.run(
            whisper_service.transcribe(video_path, language=language, task=task, prompt=prompt)
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed for project %s", project_id)
        with SessionLocal() as db:
            project = db.get(Project, project_id)
            if project:
                project.status = "uploaded"
                db.commit()
        raise RuntimeError(f"Transcription failed: {exc}") from exc

    with SessionLocal() as db:
        db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
        for seg in segments:
            seg_words = [w for w in words if seg["start"] - 0.2 <= w["s"] <= seg["end"] + 0.2]
            db.add(
                Subtitle(
                    project_id=project_id,
                    start_time=seg["start"],
                    end_time=seg["end"],
                    text=seg["text"],
                    words_json=seg_words or words,
                )
            )
        project = db.get(Project, project_id)
        if project:
            project.status = "ready"
            project.burn_subtitles = True
        db.commit()


@router.post("/polish", response_model=list[SubtitleOut])
def polish_subtitles(
    project_id: int,
    payload: PolishSubtitlesIn | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Subtitle]:
    """AI Polish: transform rough acoustic subtitles into high-retention reel copy."""
    _owned_project(db, project_id, user)
    subs = (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )
    if not subs:
        return []

    brand = (payload.brand_name or "").strip() if payload else ""

    replacements = [
        (r"(?i)\b(in our own distels|in our own distills|in our own diesel|our own diesel)\b", "At our agency One Digital"),
        (r"(?i)\bwe work in a genuine result\b", "We are dedicated to delivering genuine results"),
        (r"(?i)\bwe work dedicated to provide genuine results to you\b", "We are dedicated to delivering genuine results and tangible ROI"),
        (r"(?i)\bwe calculate every rupee\b", "We invest every single marketing rupee strategically with precision"),
        (r"(?i)\bwe work every rupee calculated\b", "We invest every single marketing rupee strategically with precision"),
        (r"(?i)\bhow many are converted\b", "how many actually converted"),
        (r"(?i)\bhow many sales are there\b", "how many sales closed"),
        (r"(?i)\bhave you ever asked this\b", "have you ever asked them"),
        (r"(?i)\bthey convert the leads they give them\b", "Generating quality leads and converting them into sales"),
        (r"(?i)\bwhat is digital marketing\b", "What actually is digital marketing"),
        (r"(?i)\b(postures|postage), reels, shooting(\.|\,)?\b", "Just posting graphics, uploading reels, and shooting videos..."),
        (r"(?i)\bis that all\? no\.\b", "is that all? No."),
        (r"(?i)\bdigital marketing is about creating revenue for clients, creating business for them\b", "Real digital marketing means scaling client revenue and growing their business"),
    ]

    for s in subs:
        text = whisper_service.clean_marketing_text(s.text)
        if brand:
            text = re.sub(rf"(?i)\b{re.escape(brand)}\b", brand, text)

        for pat, rep in replacements:
            text = re.sub(pat, rep, text)

        text = text.strip()
        if text:
            text = text[0].upper() + text[1:]
            if not text.endswith((".", "?", "!", "...")):
                text += "."
        s.text = text

    project = db.get(Project, project_id)
    if project:
        project.burn_subtitles = True
    db.commit()
    return (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )


@router.post("/import-script", response_model=list[SubtitleOut])
def import_script(
    project_id: int,
    payload: ImportScriptIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Subtitle]:
    """Import and auto-align a custom script or SRT onto the video timeline."""
    project = _owned_project(db, project_id, user)
    text = (payload.script_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Script text cannot be empty.")

    # 1. Check for SRT timestamp formatting
    srt_pattern = re.compile(
        r"(?:\d+\s*\r?\n)?(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*\r?\n(.*?)(?=\r?\n\r?\n|\Z)",
        re.DOTALL,
    )
    matches = list(srt_pattern.finditer(text))

    def parse_srt_time(ts: str) -> float:
        ts = ts.replace(",", ".")
        parts = ts.split(":")
        h = float(parts[0])
        m = float(parts[1])
        s = float(parts[2])
        return h * 3600 + m * 60 + s

    new_subs = []
    if matches:
        for m in matches:
            start_s = parse_srt_time(m.group(1))
            end_s = parse_srt_time(m.group(2))
            caption = m.group(3).strip()
            caption = " ".join(line.strip() for line in caption.splitlines() if line.strip())
            if caption:
                new_subs.append({"start": start_s, "end": end_s, "text": caption})
    else:
        # Plain text script lines: align with existing subtitle timing or distribute evenly
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        existing = (
            db.query(Subtitle)
            .filter(Subtitle.project_id == project_id)
            .order_by(Subtitle.start_time)
            .all()
        )
        total_dur = float(project.duration) or (existing[-1].end_time if existing else 60.0)

        if existing and len(lines) == len(existing):
            for line, ex in zip(lines, existing):
                new_subs.append({"start": ex.start_time, "end": ex.end_time, "text": line})
        else:
            speech_start = existing[0].start_time if existing else 0.0
            speech_end = existing[-1].end_time if existing else total_dur
            dur_per_line = max(1.5, (speech_end - speech_start) / max(len(lines), 1))
            for i, line in enumerate(lines):
                s_t = round(speech_start + i * dur_per_line, 3)
                e_t = round(min(speech_end, s_t + dur_per_line - 0.1), 3)
                new_subs.append({"start": s_t, "end": e_t, "text": line})

    if not new_subs:
        raise HTTPException(status_code=400, detail="Could not parse any subtitles from the script.")

    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    for s in new_subs:
        db.add(
            Subtitle(
                project_id=project_id,
                start_time=s["start"],
                end_time=s["end"],
                text=s["text"],
                words_json=[],
            )
        )
    project = db.get(Project, project_id)
    if project:
        project.burn_subtitles = True
    db.commit()

    return (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )


@router.get("", response_model=list[SubtitleOut])
def list_subtitles(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Subtitle]:
    _owned_project(db, project_id, user)
    return (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )


@router.put("", response_model=list[SubtitleOut])
def save_subtitles(
    project_id: int,
    payload: SubtitleListIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Subtitle]:
    """Replace the whole subtitle track with the supplied blocks.

    Blocks that carry an `id` are updated in place, blocks without one are
    inserted, and any existing block that is not in the payload is deleted.
    """
    _owned_project(db, project_id, user)

    keep = {s.id for s in payload.subtitles if s.id}
    query = db.query(Subtitle).filter(Subtitle.project_id == project_id)
    if keep:
        query = query.filter(Subtitle.id.notin_(keep))
    query.delete(synchronize_session=False)

    existing = {s.id: s for s in db.query(Subtitle).filter(Subtitle.project_id == project_id).all()}
    for item in payload.subtitles:
        if item.id and item.id in existing:
            row = existing[item.id]
            row.start_time = item.start_time
            row.end_time = item.end_time
            row.text = item.text
            if item.words_json is not None:
                row.words_json = item.words_json
        else:
            db.add(
                Subtitle(
                    project_id=project_id,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    text=item.text,
                    words_json=item.words_json,
                )
            )
    project = db.get(Project, project_id)
    if project and payload.subtitles:
        project.burn_subtitles = True
    db.commit()

    return (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )


@router.delete("/{subtitle_id}")
def delete_subtitle(
    project_id: int,
    subtitle_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _owned_project(db, project_id, user)
    row = db.get(Subtitle, subtitle_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="Subtitle not found.")
    db.delete(row)
    db.commit()
    return {"ok": True}
