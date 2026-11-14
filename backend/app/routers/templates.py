"""Template gallery routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Template
from ..schemas import TemplateOut

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
def list_templates(
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Template]:
    query = db.query(Template).filter(Template.enabled.is_(True))
    if category and category.lower() != "all":
        query = query.filter(Template.category == category)
    if search:
        like = f"%{search.strip().lower()}%"
        query = query.filter(
            db.query(Template)
            .filter(Template.name.ilike(like) | Template.description.ilike(like) | Template.fx.ilike(like))
            .exists()
        )
    return query.order_by(Template.number).all()


@router.get("/categories", response_model=list[str])
def categories(db: Session = Depends(get_db)) -> list[str]:
    rows = (
        db.query(Template.category)
        .filter(Template.enabled.is_(True))
        .distinct()
        .order_by(Template.category)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)) -> Template:
    template = db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template
