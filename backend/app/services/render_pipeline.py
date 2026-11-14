"""Background render pipeline.

Flow:
  1. trim  (10%)  - ffmpeg cut of the selected range
  2. plan  (20%)  - build plan.json, shift effect/subtitle times
  3. check (20%)  - quick --still render at the middle of every effect
  4. render(20-90%)- the effects engine renders the plan
  5. subs  (90%)  - burn subtitles when enabled
  6. done  (100%) - finalise
"""
from __future__ import annotations

import asyncio
import shutil
import traceback
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Project, ProjectEffect, RenderJob, Subtitle, Template
from . import effect_engine, ffmpeg_service, plan_builder, subtitle_burn
from .ffmpeg_service import trim_video, workspace_for

# --- simple global render queue -------------------------------------------
_queue: asyncio.Queue[int] = asyncio.Queue()
_active_users: set[int] = set()
_queue_lock = asyncio.Lock()


async def acquire_slot(user_id: int) -> int:
    """Wait for a free render slot. Returns the queue position (0 = running)."""
    async with _queue_lock:
        if user_id in _active_users:
            raise RuntimeError("A render for this project is already running.")
        if len(_active_users) >= settings.render_workers:
            _queue.put_nowait(user_id)
            position = _queue.qsize()
            while user_id in _active_users or _queue.qsize() >= position:
                await asyncio.sleep(0.4)
                async with _queue_lock:
                    if user_id not in _active_users:
                        break
        _active_users.add(user_id)
    return 0


async def release_slot(user_id: int) -> None:
    async with _queue_lock:
        _active_users.discard(user_id)


def _update(job_id: int, **fields) -> None:
    with SessionLocal() as db:
        job = db.get(RenderJob, job_id)
        if not job:
            return
        for key, value in fields.items():
            setattr(job, key, value)
        db.commit()


def _load_effects(db: Session, project_id: int) -> list[dict]:
    rows = (
        db.query(ProjectEffect)
        .filter(ProjectEffect.project_id == project_id)
        .order_by(ProjectEffect.order_index)
        .all()
    )
    out = []
    for row in rows:
        template = db.get(Template, row.template_id)
        out.append(
            {
                "fx": template.fx if template else "",
                "start_time": row.start_time,
                "end_time": row.end_time,
                "options_json": row.options_json or {},
            }
        )
    return out


def _load_subtitles(db: Session, project_id: int) -> list[dict]:
    rows = (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_time)
        .all()
    )
    return [
        {"start": r.start_time, "end": r.end_time, "text": r.text}
        for r in rows
        if (r.text or "").strip()
    ]


async def run_render(
    job_id: int,
    project_id: int,
    user_id: int,
    width: int | None = None,
    subtitle_font: str = "Inter",
    subtitle_size: int = 58,
    subtitle_color: str = "FFFFFF",
    subtitle_bold: bool = True,
    subtitle_uppercase: bool = True,
    subtitle_boxed: bool = False,
    subtitle_highlight_color: str = "E5252A",
    brand_tag: str | None = None,
) -> None:
    """Execute a render job. Never raises - failures are recorded on the job."""
    width = width or settings.effects_width
    workdir = workspace_for(project_id)
    acquired = False
    try:
        try:
            await acquire_slot(user_id)
            acquired = True
        except RuntimeError as exc:
            _update(job_id, status="failed", error=str(exc), finished_at=_now())
            return

        with SessionLocal() as db:
            project = db.get(Project, project_id)
            if not project:
                _update(job_id, status="failed", error="Project not found.")
                return
            source = Path(project.video_path)
            trim_start = float(project.trim_start or 0.0)
            trim_end = float(project.trim_end or project.duration or 0.0)
            if trim_end <= trim_start:
                trim_end = float(project.duration or trim_start + 1.0)
            effects = _load_effects(db, project_id)
            subtitles = _load_subtitles(db, project_id)
            # If project has subtitles, automatically burn them unless explicitly turned off
            burn_subs = bool(project.burn_subtitles) or (len(subtitles) > 0 and project.burn_subtitles is not False)

        if not effects:
            _update(
                job_id,
                status="failed",
                error="Add at least one effect before starting the render.",
                finished_at=_now(),
            )
            return

        # ---- 1. trim ------------------------------------------------------
        _update(job_id, status="running", stage="trim", progress=10)
        trimmed = workdir / "trimmed.mp4"
        code, _out, err = await trim_video(source, trimmed, trim_start, trim_end)
        if code != 0 or not trimmed.exists():
            _update(
                job_id,
                status="failed",
                stage="trim",
                error=f"Could not trim the video: {err.strip()[-2000:]}",
                finished_at=_now(),
            )
            return

        # ---- 2. plan ------------------------------------------------------
        _update(job_id, stage="plan", progress=20)
        project_images = settings.images_dir / f"project_{project_id}"
        project_images.mkdir(parents=True, exist_ok=True)

        card_effects = {
            "fan-build", "noise", "orbit", "carousel-spin", "place-in-grid",
            "check-pills", "profile-wall", "phone-fan", "broll-split", "timeline"
        }
        needs_images = False
        with SessionLocal() as db:
            for e in _load_effects(db, project_id):
                tpl = db.get(Template, e.get("template_id"))
                fx_name = e.get("fx") or (tpl.fx if tpl else "")
                if (tpl and tpl.needs_images) or fx_name in card_effects or (e.get("options_json") or {}).get("images") is not None:
                    needs_images = True
                    break

        if needs_images:
            valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
            existing_imgs = [p for p in project_images.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
            # If user hasn't uploaded images (or fewer than 4), automatically extract snapshot cards from video!
            if len(existing_imgs) < 4:
                _update(job_id, stage="plan", progress=22)
                await ffmpeg_service.auto_extract_video_cards(source, project_images, count=6)
            images_dir = str(project_images)
        else:
            images_dir = None

        plan = plan_builder.build_plan(
            effects,
            trim_start=trim_start,
            trim_end=trim_end,
            images_dir=images_dir,
        )
        plan_path = workdir / "plan.json"
        effect_engine.write_plan(plan, plan_path)

        # ---- 3. quick check frames ---------------------------------------
        _update(job_id, stage="check", progress=20)
        mids = [
            plan_builder.effect_midpoint(e["start"], e["end"]) for e in plan["effects"]
        ]
        check_png = workdir / "check.png"
        ok, message = await effect_engine.render_still(
            plan, trimmed, check_png, mids, width=540, timeout=600
        )
        if not ok:
            _update(
                job_id,
                status="failed",
                stage="check",
                error=(
                    "The effects engine could not render a check frame. "
                    "Please check your effect options and try again.\n" + message
                ),
                finished_at=_now(),
            )
            return

        # ---- 4. render ----------------------------------------------------
        _update(job_id, stage="render", progress=20)
        rendered = workdir / "rendered.mp4"
        state = {"pass": 1, "pct": 20}

        async def on_progress(line: str) -> None:
            low = line.lower()
            if "pass 2" in low:
                # The engine is now compositing frames: that half of the work
                # maps to 35% - 90% of the overall job.
                state["pass"] = 2
                state["pct"] = max(state["pct"], 35)
                _update(job_id, progress=state["pct"], stage="render")
                return
            if "pass 1" in low:
                _update(job_id, progress=state["pct"], stage="render")
                return
            fraction = effect_engine.parse_progress(line)
            if fraction is None:
                return
            if state["pass"] == 1:
                pct = 20 + int(fraction * 15)
            else:
                pct = 35 + int(fraction * 55)
            pct = min(pct, 90)
            if pct > state["pct"]:
                state["pct"] = pct
                _update(job_id, progress=pct, stage="render")

        ok, message = await effect_engine.render_plan(
            plan, trimmed, rendered, plan_path, width=width, on_progress=on_progress
        )
        if not ok or not rendered.exists():
            _update(
                job_id,
                status="failed",
                stage="render",
                error=message,
                finished_at=_now(),
            )
            return

        final = rendered

        # ---- 5. subtitles & brand watermark -------------------------------
        if (burn_subs and subtitles) or (brand_tag and brand_tag.strip()):
            _update(job_id, stage="subtitles", progress=90)
            offset = trim_start
            shifted = [
                {
                    "start": max(0.0, s["start"] - offset),
                    "end": max(0.1, s["end"] - offset),
                    "text": s["text"],
                }
                for s in (subtitles if burn_subs else [])
            ]
            with_sub = workdir / "final.mp4"
            ok, message = await subtitle_burn.burn(
                rendered,
                shifted,
                with_sub,
                font=subtitle_font,
                size=subtitle_size,
                color=subtitle_color,
                bold=subtitle_bold,
                uppercase=subtitle_uppercase,
                boxed=subtitle_boxed,
                highlight_color=subtitle_highlight_color,
                brand_tag=brand_tag,
                effects=effects,
            )
            if ok and with_sub.exists():
                final = with_sub
            else:
                _update(
                    job_id,
                    stage="subtitles",
                    error=f"Subtitle burn-in failed, keeping the clean render: {message}",
                )

        # ---- 6. done ------------------------------------------------------
        _update(
            job_id,
            status="done",
            stage="done",
            progress=100,
            output_path=str(final),
            finished_at=_now(),
        )
        with SessionLocal() as db:
            project = db.get(Project, project_id)
            if project:
                project.status = "done"
                db.commit()

    except Exception as exc:  # noqa: BLE001 - the job must never crash the server
        trace = traceback.format_exc()
        _update(
            job_id,
            status="failed",
            stage="error",
            error=f"{exc}\n\n{trace}"[-4000:],
            finished_at=_now(),
        )
    finally:
        if acquired:
            await release_slot(user_id)


def _now():
    from datetime import datetime

    return datetime.utcnow()


async def cleanup_old_files() -> dict:
    """Delete uploads and renders older than the configured age."""
    import time

    cutoff = time.time() - settings.cleanup_after_hours * 3600
    removed = 0
    for base in (settings.upload_dir, settings.renders_dir, settings.previews_dir):
        if not base.exists():
            continue
        for item in base.rglob("*"):
            try:
                if item.is_file() and item.stat().st_mtime < cutoff:
                    item.unlink()
                    removed += 1
            except OSError:
                continue
    return {"removed": removed}
