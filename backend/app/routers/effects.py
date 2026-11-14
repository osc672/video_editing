"""Per-project effect list (template + options + time window)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, ProjectEffect, Template, User
from ..schemas import EffectListIn, EffectOut
from ..security import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/effects", tags=["effects"])

MAX_WINDOW_SECONDS = 30.0


def _owned_project(db: Session, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("", response_model=list[EffectOut])
def list_effects(
    project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ProjectEffect]:
    _owned_project(db, project_id, user)
    return (
        db.query(ProjectEffect)
        .filter(ProjectEffect.project_id == project_id)
        .order_by(ProjectEffect.order_index)
        .all()
    )


@router.put("", response_model=list[EffectOut])
def save_effects(
    project_id: int,
    payload: EffectListIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProjectEffect]:
    """Replace the project's effect list. Times are absolute in the source video."""
    project = _owned_project(db, project_id, user)
    duration = float(project.duration or 0.0)

    keep_ids = {e.id for e in payload.effects if e.id}
    if keep_ids:
        db.query(ProjectEffect).filter(
            ProjectEffect.project_id == project_id,
            ProjectEffect.id.notin_(keep_ids),
        ).delete(synchronize_session=False)
    else:
        db.query(ProjectEffect).filter(ProjectEffect.project_id == project_id).delete(
            synchronize_session=False
        )

    existing = {
        e.id: e
        for e in db.query(ProjectEffect).filter(ProjectEffect.project_id == project_id).all()
    }

    for index, item in enumerate(payload.effects):
        template = db.get(Template, item.template_id)
        if not template:
            raise HTTPException(
                status_code=400, detail=f"Template {item.template_id} does not exist."
            )

        start = max(0.0, float(item.start_time))
        end = float(item.end_time)
        if duration > 0:
            start = min(start, duration)
            end = min(end, duration)
        if end <= start:
            end = min(start + 1.0, duration or start + 1.0)
        if end - start > MAX_WINDOW_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Effect windows cannot be longer than {MAX_WINDOW_SECONDS:.0f}s.",
            )

        if item.id and item.id in existing:
            row = existing[item.id]
        else:
            row = ProjectEffect(project_id=project_id)
            db.add(row)

        row.template_id = template.id
        row.start_time = round(start, 3)
        row.end_time = round(end, 3)
        row.options_json = item.options_json or {}
        row.order_index = index

    db.commit()

    return (
        db.query(ProjectEffect)
        .filter(ProjectEffect.project_id == project_id)
        .order_by(ProjectEffect.order_index)
        .all()
    )
