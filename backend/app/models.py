"""ORM models for AI Reel Editor."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(190), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    video_path: Mapped[str] = mapped_column(String(600), nullable=False)
    duration: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    height: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fps: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    trim_start: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    trim_end: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    burn_subtitles: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="uploaded", nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

    user: Mapped["User"] = relationship(back_populates="projects")
    subtitles: Mapped[list["Subtitle"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Subtitle.start_time"
    )
    effects: Mapped[list["ProjectEffect"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectEffect.order_index",
    )
    render_jobs: Mapped[list["RenderJob"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Subtitle(Base):
    __tablename__ = "subtitles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    words_json: Mapped[list | None] = mapped_column(JSON, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="subtitles")


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    fx: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    options_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    needs_images: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProjectEffect(Base):
    __tablename__ = "project_effects"
    __table_args__ = (UniqueConstraint("project_id", "order_index", name="uq_effect_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int] = mapped_column(
        ForeignKey("templates.id", ondelete="CASCADE"), nullable=False
    )
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    options_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="effects")
    template: Mapped["Template"] = relationship()


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage: Mapped[str] = mapped_column(String(64), default="queued", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False, index=True)
    output_path: Mapped[str | None] = mapped_column(String(600), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    queue_position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="render_jobs")
