"""Project routes: upload, metadata, thumbnails, asset images, preview stills."""
from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Project, User
from ..schemas import ProjectListItem, ProjectOut, ProjectPatch, VideoCutIn
from ..security import get_current_user, get_current_user_or_query_token
from ..services import effect_engine, ffmpeg_service, plan_builder

router = APIRouter(prefix="/api/projects", tags=["projects"])

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}


def safe_filename(name: str) -> str:
    """Strip directories and unsafe characters from an uploaded file name."""
    name = Path(name or "upload").name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return name[:120] or "upload"


def _owned_project(db: Session, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    # In single-tenant/local app mode, allow project access across local demo accounts
    return project


@router.post("/upload", response_model=ProjectOut)
async def upload_project(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    if not ffmpeg_service.ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail="ffmpeg was not found on this machine. Install it and restart the backend.",
        )

    original = file.filename or "upload.mp4"
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Upload an mp4 or mov file.",
        )

    max_bytes = settings.max_upload_mb * 1024 * 1024
    target_dir = ffmpeg_service.user_dir(user.id)
    stored = target_dir / f"{safe_filename(original)}"
    stored = stored.with_suffix(f".{stored.suffix.strip('.') or 'mp4'}")

    size = 0
    with stored.open("wb") as fh:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                fh.close()
                stored.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"That file is larger than {settings.max_upload_mb} MB.",
                )
            fh.write(chunk)

    if size == 0:
        stored.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="That file is empty.")

    try:
        info = await ffmpeg_service.video_info(stored)
    except ffmpeg_service.FFmpegError as exc:
        stored.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read that video: {exc}")

    project = Project(
        user_id=user.id,
        original_filename=original,
        video_path=str(stored),
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
        fps=info["fps"],
        trim_start=0.0,
        trim_end=info["duration"],
        status="uploaded",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    thumbs_dir = settings.thumbs_dir / f"project_{project.id}"
    await ffmpeg_service.extract_thumbnails(stored, thumbs_dir)

    return project


@router.get("", response_model=list[ProjectListItem])
def list_projects(
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> list[dict]:
    projects = (
        db.query(Project)
        .filter(Project.user_id == user.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    items = []
    for p in projects:
        thumb_path = settings.thumbs_dir / f"project_{p.id}" / "thumb_01.jpg"
        thumb_url = f"/api/projects/{p.id}/thumbnails/thumb_01.jpg" if thumb_path.exists() else None

        latest_job = max(p.render_jobs, key=lambda j: j.created_at, default=None)
        has_render = latest_job is not None and latest_job.status == "done"
        render_status = latest_job.status if latest_job else None
        render_job_id = latest_job.id if latest_job else None

        items.append({
            "id": p.id,
            "user_id": p.user_id,
            "original_filename": p.original_filename,
            "duration": p.duration,
            "width": p.width,
            "height": p.height,
            "fps": p.fps,
            "trim_start": p.trim_start,
            "trim_end": p.trim_end,
            "burn_subtitles": p.burn_subtitles,
            "status": p.status,
            "created_at": p.created_at,
            "thumbnail_url": thumb_url,
            "has_render": has_render,
            "render_status": render_status,
            "render_job_id": render_job_id,
        })
    return items


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> dict:
    project = _owned_project(db, project_id, user)
    # Remove single uploaded video file if stored directly
    if project.video_path:
        vp = Path(project.video_path)
        if vp.exists() and vp.is_file():
            try:
                vp.unlink(missing_ok=True)
            except Exception:
                pass

    dirs_to_clean = [
        settings.upload_dir / f"project_{project_id}",
        settings.thumbs_dir / f"project_{project_id}",
        settings.images_dir / f"project_{project_id}",
        settings.renders_dir / f"project_{project_id}",
        settings.subtitles_dir / f"project_{project_id}",
    ]
    for d in dirs_to_clean:
        if d.exists() and d.is_dir():
            shutil.rmtree(d, ignore_errors=True)
    db.delete(project)
    db.commit()
    return {"ok": True, "message": "Project deleted."}


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Project:
    return _owned_project(db, project_id, user)


@router.patch("/{project_id}", response_model=ProjectOut)
def patch_project(
    project_id: int,
    payload: ProjectPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = _owned_project(db, project_id, user)
    data = payload.model_dump(exclude_none=True)

    if "trim_start" in data or "trim_end" in data:
        start = float(data.get("trim_start", project.trim_start))
        end = float(data.get("trim_end", project.trim_end))
        duration = float(project.duration or 0.0)
        start = max(0.0, min(start, duration))
        end = max(0.0, min(end, duration))
        if end - start < 0.5:
            raise HTTPException(status_code=400, detail="The trim range must be at least 0.5s long.")
        project.trim_start = round(start, 3)
        project.trim_end = round(end, 3)

    if "burn_subtitles" in data:
        project.burn_subtitles = bool(data["burn_subtitles"])
    if "status" in data:
        project.status = data["status"]

    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}/thumbnails")
def list_thumbnails(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    project = _owned_project(db, project_id, user)
    thumbs_dir = settings.thumbs_dir / f"project_{project.id}"
    names = sorted(p.name for p in thumbs_dir.glob("thumb_*.jpg"))
    return {
        "project_id": project.id,
        "duration": project.duration,
        "thumbnails": [f"/api/projects/{project.id}/thumbnails/{n}" for n in names],
        "files": names,
    }


@router.get("/{project_id}/thumbnails/{name}")
def get_thumbnail(
    project_id: int, name: str, user: User = Depends(get_current_user_or_query_token), db: Session = Depends(get_db)
) -> FileResponse:
    _owned_project(db, project_id, user)
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Bad file name.")
    path = settings.thumbs_dir / f"project_{project_id}" / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found.")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/{project_id}/video")
def stream_video(
    project_id: int, user: User = Depends(get_current_user_or_query_token), db: Session = Depends(get_db)
) -> FileResponse:
    project = _owned_project(db, project_id, user)
    path = Path(project.video_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="The uploaded video is gone.")
    return FileResponse(path, media_type="video/mp4")


@router.get("/{project_id}/images")
def list_images(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    _owned_project(db, project_id, user)
    folder = ffmpeg_service.project_images_dir(project_id)
    files = sorted(p for p in folder.iterdir() if p.is_file())
    return {
        "count": len(files),
        "images": [
            {
                "name": p.name,
                "url": f"/api/projects/{project_id}/images/{p.name}",
                "size": p.stat().st_size,
            }
            for p in files
        ],
    }


@router.get("/{project_id}/images/{name}")
def get_image(
    project_id: int,
    name: str,
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> FileResponse:
    _owned_project(db, project_id, user)
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Bad file name.")
    path = ffmpeg_service.project_images_dir(project_id) / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(path)


@router.post("/{project_id}/images")
async def upload_images(
    project_id: int,
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _owned_project(db, project_id, user)
    folder = ffmpeg_service.project_images_dir(project_id)
    max_bytes = 20 * 1024 * 1024
    saved: list[str] = []
    rejected: list[str] = []

    for upload in files:
        name = safe_filename(upload.filename or "image.jpg")
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXT:
            rejected.append(f"{name} (unsupported type)")
            continue
        target = folder / name
        counter = 1
        while target.exists():
            target = folder / f"{Path(name).stem}_{counter}{ext}"
            counter += 1
        size = 0
        with target.open("wb") as fh:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    break
                fh.write(chunk)
        if size > max_bytes:
            target.unlink(missing_ok=True)
            rejected.append(f"{name} (over 20 MB)")
            continue
        saved.append(target.name)

    return {"count": len(saved), "saved": saved, "rejected": rejected}


@router.delete("/{project_id}/images/{name}")
def delete_image(
    project_id: int, name: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    _owned_project(db, project_id, user)
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Bad file name.")
    folder = ffmpeg_service.project_images_dir(project_id)
    path = folder / name
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.post("/{project_id}/word-timing")
async def word_timing(
    project_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Resolve when a word is spoken, so an effect window can land on it.

    Uses the engine's own scripts/words.py (faster-whisper with word
    timestamps) and caches the result on the project.
    """
    project = _owned_project(db, project_id, user)
    needle = (payload.get("word") or "").strip()
    if not needle:
        raise HTTPException(status_code=400, detail="Type the word you want to land on.")

    setup = effect_engine.check_setup()
    if not setup["ready"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "The effects engine is not ready. Run `python scripts/setup_effects.py` "
                "in the backend folder, then restart the server."
            ),
        )

    cache_file = settings.subtitles_dir / f"project_{project_id}" / "words.json"
    words: list[dict] = []
    if cache_file.exists():
        try:
            with cache_file.open("r", encoding="utf-8") as fh:
                words = json.load(fh)
        except (OSError, ValueError):
            words = []

    if not words:
        try:
            words = await effect_engine.word_timings(Path(project.video_path))
        except effect_engine.EffectEngineError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with cache_file.open("w", encoding="utf-8", newline="\n") as fh:
            json.dump(words, fh, ensure_ascii=False)

    hit = effect_engine.find_word(words, needle)
    if not hit:
        return {
            "found": False,
            "word": needle,
            "message": f"“{needle}” was not said in this clip.",
            "candidates": [w["w"] for w in words[:60]],
        }

    return {
        "found": True,
        "word": hit["w"],
        "start": hit["s"],
        "end": hit["e"],
        "message": f"“{hit['w']}” starts at {hit['s']:.2f}s.",
    }


@router.post("/{project_id}/preview-still")
async def preview_still(
    project_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Render a single check frame of an effect with the engine's --still mode."""
    project = _owned_project(db, project_id, user)
    setup = effect_engine.check_setup()
    if not setup["ready"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "The effects engine is not ready. Run `python scripts/setup_effects.py` "
                "in the backend folder, then restart the server."
            ),
        )

    fx = payload.get("fx") or ""
    options = payload.get("options_json") or {}
    time = float(payload.get("time") or 0.0)
    start = payload.get("start_time")
    end = payload.get("end_time")

    if not fx:
        raise HTTPException(status_code=400, detail="No effect selected.")

    start = float(start) if start is not None else max(time - 1.0, 0.0)
    end = float(end) if end is not None else time + 0.05
    if end <= start:
        end = start + 1.0

    card_effects = {
        "fan-build", "noise", "orbit", "carousel-spin", "place-in-grid",
        "check-pills", "profile-wall", "phone-fan", "broll-split", "timeline"
    }
    project_images = settings.images_dir / f"project_{project_id}"
    project_images.mkdir(parents=True, exist_ok=True)
    if fx in card_effects or (options or {}).get("images") is not None:
        valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
        existing = [p for p in project_images.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
        if len(existing) < 4:
            await ffmpeg_service.auto_extract_video_cards(project.video_path, project_images, count=6)

    plan = plan_builder.build_plan(
        [
            {
                "fx": fx,
                "start_time": start,
                "end_time": end,
                "options_json": options,
            }
        ],
        trim_start=0.0,
        images_dir=str(project_images),
    )

    out_dir = settings.previews_dir / f"project_{project_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"still_{abs(hash((fx, time, str(options)))) % 10_000_000}.png"

    ok, message = await effect_engine.render_still(
        plan, Path(project.video_path), target, [time], width=540, timeout=420
    )
    if not ok or not target.exists():
        raise HTTPException(status_code=500, detail=f"Preview failed: {message[-1500:]}")

    return FileResponse(target, media_type="image/png")


@router.post("/{project_id}/cut")
async def cut_video(
    project_id: int,
    payload: VideoCutIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _owned_project(db, project_id, user)
    kept_ranges = [
        (float(r[0]), float(r[1]))
        for r in payload.kept_ranges
        if len(r) >= 2 and float(r[1]) > float(r[0])
    ]
    if not kept_ranges:
        raise HTTPException(status_code=400, detail="At least one valid video range is required.")

    src_path = Path(project.video_path)
    if not src_path.is_file():
        raise HTTPException(status_code=404, detail="Source video file not found.")

    renders_dir = settings.renders_dir / f"project_{project_id}"
    renders_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique output file so FFmpeg input and output never collide,
    # and Windows file locking doesn't conflict with current active stream
    dest_filename = f"cut_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    dest_path = renders_dir / dest_filename

    code, out, err = await ffmpeg_service.cut_and_concat_video(src_path, dest_path, kept_ranges)
    if code != 0 or not dest_path.is_file():
        raise HTTPException(status_code=500, detail=f"Failed to cut video: {err or out}")

    info = await ffmpeg_service.video_info(dest_path)
    new_duration = float(info["duration"])

    # Update project to use the cut video
    old_video_path = project.video_path
    project.duration = new_duration
    project.trim_start = 0.0
    project.trim_end = new_duration
    project.video_path = str(dest_path)
    project.status = "cut_saved" if payload.action == "save" else "ready"
    db.commit()
    db.refresh(project)

    # Clean up previous intermediate cut video if it exists in renders_dir
    try:
        old_path = Path(old_video_path).resolve()
        if old_path.is_file() and old_path != dest_path.resolve() and renders_dir.resolve() in old_path.parents:
            old_path.unlink(missing_ok=True)
    except Exception:
        pass

    # Re-extract filmstrip thumbnails for the cut video in background
    thumbs_dir = settings.thumbs_dir / f"project_{project_id}"
    background_tasks.add_task(ffmpeg_service.extract_thumbnails, dest_path, thumbs_dir)

    # Delete previous subtitles since audio timing has shifted
    from ..models import Subtitle
    db.query(Subtitle).filter_by(project_id=project.id).delete()
    db.commit()

    return {
        "status": "success",
        "action": payload.action,
        "project_id": project.id,
        "duration": new_duration,
        "video_url": f"/api/projects/{project.id}/cut-video",
        "next": f"/editor/{project.id}" if payload.action == "proceed" else None,
        "message": "Video successfully cut and processed!",
    }


@router.get("/{project_id}/cut-video")
def download_cut_video(
    project_id: int,
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> FileResponse:
    project = _owned_project(db, project_id, user)
    target = Path(project.video_path)
    if not target.is_file():
        renders_dir = settings.renders_dir / f"project_{project_id}"
        cuts = sorted(renders_dir.glob("cut_*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if cuts and cuts[0].is_file():
            target = cuts[0]
        else:
            raise HTTPException(status_code=404, detail="Cut video file not found.")
    safe_name = f"cut_{Path(project.original_filename).name}"
    return FileResponse(
        target,
        media_type="video/mp4",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )

