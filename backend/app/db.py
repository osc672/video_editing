"""SQLAlchemy engine / session wiring."""
from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


def _create_resilient_engine():
    url = settings.resolved_database_url
    is_docker = (
        os.path.exists("/.dockerenv")
        or bool(os.environ.get("RAILWAY_ENVIRONMENT"))
        or bool(os.environ.get("RAILWAY_SERVICE_ID"))
        or bool(os.environ.get("PORT"))
    )
    is_local_host = "127.0.0.1" in url or "localhost" in url

    # If running in a cloud container and still pointed at localhost without local DB, fallback immediately
    if is_docker and is_local_host and not os.environ.get("DATABASE_URL") and not os.environ.get("MYSQLHOST"):
        print("[AI Reel Editor] Railway cloud environment detected without MySQL link. Using persistent SQLite.")
        sqlite_file = settings.storage_dir / "app.db"
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        return create_engine(
            f"sqlite:///{sqlite_file}",
            connect_args={"check_same_thread": False},
            future=True,
        )

    if url.startswith("sqlite"):
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            future=True,
        )

    try:
        eng = create_engine(
            url,
            pool_pre_ping=True,
            pool_recycle=280,
            pool_size=10,
            max_overflow=20,
            future=True,
        )
        with eng.connect():
            pass
        return eng
    except Exception as e:
        print(f"[AI Reel Editor] Warning: Database connection to {url} failed ({e}). Falling back to SQLite.")
        sqlite_file = settings.storage_dir / "app.db"
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        return create_engine(
            f"sqlite:///{sqlite_file}",
            connect_args={"check_same_thread": False},
            future=True,
        )


engine = _create_resilient_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

