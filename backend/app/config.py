"""Application configuration loaded from environment / .env file."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
REPO_ROOT = BASE_DIR.parent                                  # project root
EFFECTS_DIR = BASE_DIR / "vendor" / "effects"                # cloned effects repo
STORAGE_DIR = BASE_DIR / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- database -------------------------------------------------------
    database_url: str = "mysql+pymysql://root:@127.0.0.1:3307/ai_video_editor"

    # --- auth -----------------------------------------------------------
    jwt_secret: str = "change-me-in-production-please-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    # --- uploads --------------------------------------------------------
    max_upload_mb: int = 600
    allowed_video_ext: str = ".mp4,.mov,.m4v,.webm,.mkv"

    # --- whisper --------------------------------------------------------
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_prompt: str = (
        "High-converting social media reel. Professional discussion about digital marketing, "
        "performance marketing, business growth, leads, conversion, sales, campaigns, "
        "client revenue, ROI, One Digital, Vijayawada."
    )

    # --- effect engine --------------------------------------------------
    effects_path: str = str(EFFECTS_DIR)
    effects_python: str = ""          # auto-detected when blank
    effects_width: int = 1080          # 1080 default, 2160 for 4K
    render_timeout_seconds: int = 900  # 15 minutes

    # --- queue ----------------------------------------------------------
    max_global_renders: int = 3
    render_workers: int = 2

    # --- cors / server --------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- cleanup --------------------------------------------------------
    cleanup_after_hours: int = 24

    @property
    def upload_dir(self) -> Path:
        return STORAGE_DIR / "uploads"

    @property
    def uploads_dir(self) -> Path:
        return STORAGE_DIR / "uploads"

    @property
    def thumbs_dir(self) -> Path:
        return STORAGE_DIR / "thumbs"

    @property
    def renders_dir(self) -> Path:
        return STORAGE_DIR / "renders"

    @property
    def subtitles_dir(self) -> Path:
        return STORAGE_DIR / "subtitles"

    @property
    def previews_dir(self) -> Path:
        return STORAGE_DIR / "previews"

    @property
    def images_dir(self) -> Path:
        return STORAGE_DIR / "images"

    @property
    def static_templates_dir(self) -> Path:
        return STORAGE_DIR / "static" / "templates"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_database_url(self) -> str:
        url = os.environ.get("DATABASE_URL") or os.environ.get("MYSQL_URL") or self.database_url
        if url.startswith("mysql://"):
            url = url.replace("mysql://", "mysql+pymysql://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    s = Settings()

    # A relative EFFECTS_PATH is resolved against the backend folder so the
    # app works no matter which directory uvicorn was started from.
    effects = Path(s.effects_path)
    if not effects.is_absolute():
        effects = (BASE_DIR / effects).resolve()
    s.effects_path = str(effects)

    for d in (
        s.upload_dir,
        s.thumbs_dir,
        s.renders_dir,
        s.subtitles_dir,
        s.previews_dir,
        s.images_dir,
        s.static_templates_dir,
    ):
        d.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
