"""Render jobs: start, poll, download."""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Project, ProjectEffect, RenderJob, Template, User
from ..schemas import RenderOut, RenderStartIn
from ..security import get_current_user, get_current_user_or_query_token
from ..services import effect_engine, render_pipeline

router = APIRouter(prefix="/api", tags=["render"])

MIN_IMAGES = 3


def _owned_project(db: Session, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post("/projects/{project_id}/render", response_model=RenderOut)
async def start_render(
    project_id: int,
    payload: RenderStartIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RenderJob:
    project = _owned_project(db, project_id, user)

    setup = effect_engine.check_setup()
    if not setup["ready"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "The effects engine is not ready. Run `python scripts/setup_effects.py` "
                "in the backend folder and restart the server."
            ),
        )

    effects = (
        db.query(ProjectEffect)
        .filter(ProjectEffect.project_id == project_id)
        .order_by(ProjectEffect.order_index)
        .all()
    )
    if not effects:
        raise HTTPException(
            status_code=400, detail="Pick a template and add it to the timeline first."
        )

    # Note: If an effect needs images and user has not uploaded any,
    # the render pipeline will automatically extract snapshot frames from the video.

    # One render per project at a time.
    active = (
        db.query(RenderJob)
        .filter(
            RenderJob.project_id == project_id,
            RenderJob.status.in_(["queued", "running"]),
        )
        .first()
    )
    if active:
        raise HTTPException(
            status_code=409, detail="This project is already rendering. Please wait."
        )

    if payload.burn_subtitles is not None:
        project.burn_subtitles = bool(payload.burn_subtitles)

    job = RenderJob(
        project_id=project_id,
        progress=0,
        stage="queued",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if payload.burn_subtitles is not None:
        project.burn_subtitles = payload.burn_subtitles

    project.status = "rendering"
    db.commit()

    asyncio.create_task(
        render_pipeline.run_render(
            job.id,
            project_id,
            user.id,
            width=payload.width,
            subtitle_font=payload.subtitle_font or "Inter",
            subtitle_size=payload.subtitle_size or 58,
            subtitle_color=payload.subtitle_color or "FFFFFF",
            subtitle_bold=payload.subtitle_bold if payload.subtitle_bold is not None else True,
            subtitle_uppercase=payload.subtitle_uppercase if payload.subtitle_uppercase is not None else True,
            subtitle_boxed=payload.subtitle_boxed if payload.subtitle_boxed is not None else False,
            subtitle_highlight_color=payload.subtitle_highlight_color or "E5252A",
            brand_tag=payload.brand_tag,
        )
    )
    return job


@router.get("/render/{job_id}", response_model=RenderOut)
def get_job(
    job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RenderJob:
    job = db.get(RenderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    project = db.get(Project, job.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Render job not found.")
    return job


@router.get("/render/{job_id}/download")
def download(
    job_id: int,
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> FileResponse:
    job = db.get(RenderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    project = db.get(Project, job.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Render job not found.")
    if job.status != "done" or not job.output_path:
        raise HTTPException(status_code=409, detail="The render is not ready yet.")

    path = Path(job.output_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="The rendered file is gone.")

    name = f"{Path(project.original_filename).stem}_edited.mp4"
    return FileResponse(path, media_type="video/mp4", filename=name)


@router.get("/render/{job_id}/video")
def stream_render(
    job_id: int,
    user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> FileResponse:
    job = db.get(RenderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found.")
    project = db.get(Project, job.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Render job not found.")
    if job.status != "done" or not job.output_path:
        raise HTTPException(status_code=409, detail="The render is not ready yet.")

    path = Path(job.output_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="The rendered file is gone.")

    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
    )


@router.get("/projects/{project_id}/renders", response_model=list[RenderOut])
def project_jobs(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[RenderJob]:
    _owned_project(db, project_id, user)
    return (
        db.query(RenderJob)
        .filter(RenderJob.project_id == project_id)
        .order_by(RenderJob.created_at.desc())
        .limit(20)
        .all()
    )
