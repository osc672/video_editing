"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------- auth ----
class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=190)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ------------------------------------------------------------ projects ----
class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    original_filename: str
    video_path: str
    duration: float
    width: int
    height: int
    fps: float
    trim_start: float
    trim_end: float
    burn_subtitles: bool
    status: str
    created_at: datetime


class ProjectListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    original_filename: str
    duration: float
    width: int
    height: int
    fps: float
    trim_start: float
    trim_end: float
    burn_subtitles: bool
    status: str
    created_at: datetime
    thumbnail_url: str | None = None
    has_render: bool = False
    render_status: str | None = None
    render_job_id: int | None = None


class ProjectPatch(BaseModel):
    trim_start: float | None = None
    trim_end: float | None = None
    burn_subtitles: bool | None = None
    status: str | None = None

    @field_validator("trim_start", mode="before")
    @classmethod
    def parse_trim_start(cls, v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("trim_end", mode="before")
    @classmethod
    def parse_trim_end(cls, v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None


# ----------------------------------------------------------- subtitles ----
class SubtitleIn(BaseModel):
    id: int | None = None
    start_time: float = 0.0
    end_time: float = 0.0
    text: str = ""
    words_json: list | None = None

    @field_validator("id", mode="before")
    @classmethod
    def parse_id(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    @field_validator("start_time", mode="before")
    @classmethod
    def parse_start_time(cls, v):
        if v is None or v == "":
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("end_time", mode="before")
    @classmethod
    def parse_end_time(cls, v):
        if v is None or v == "":
            return 1.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 1.0


class SubtitleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    start_time: float
    end_time: float
    text: str
    words_json: list | None = None


class SubtitleListIn(BaseModel):
    subtitles: list[SubtitleIn]


class TranscribeIn(BaseModel):
    language: str | None = None
    task: str | None = "transcribe"
    prompt: str | None = None


class PolishSubtitlesIn(BaseModel):
    style: str | None = "marketing"
    brand_name: str | None = None


class ImportScriptIn(BaseModel):
    script_text: str


# ----------------------------------------------------------- templates ----
class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    fx: str
    name: str
    category: str
    description: str
    options_json: list
    needs_images: bool
    thumbnail_url: str
    enabled: bool


# ------------------------------------------------------------- effects ----
class EffectIn(BaseModel):
    id: int | None = None
    template_id: int
    start_time: float = 0.0
    end_time: float = 3.0
    options_json: dict = Field(default_factory=dict)
    order_index: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def parse_id(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    @field_validator("template_id", mode="before")
    @classmethod
    def parse_template_id(cls, v):
        if v is None or v == "":
            return 1
        try:
            return int(v)
        except (ValueError, TypeError):
            return 1

    @field_validator("start_time", mode="before")
    @classmethod
    def parse_start_time(cls, v):
        if v is None or v == "":
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("end_time", mode="before")
    @classmethod
    def parse_end_time(cls, v):
        if v is None or v == "":
            return 3.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 3.0


class EffectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    template_id: int
    start_time: float
    end_time: float
    options_json: dict
    order_index: int


class EffectListIn(BaseModel):
    effects: list[EffectIn]


# -------------------------------------------------------------- render ----
class RenderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    progress: int
    stage: str
    status: str
    output_path: str | None = None
    error: str | None = None
    queue_position: int = 0
    created_at: datetime
    finished_at: datetime | None = None


class RenderStartIn(BaseModel):
    burn_subtitles: bool | None = None
    width: int | None = None
    subtitle_font: str | None = "Inter"
    subtitle_size: int | None = 58
    subtitle_color: str | None = "FFFFFF"
    subtitle_highlight_color: str | None = "E5252A"
    subtitle_boxed: bool | None = False
    subtitle_bold: bool | None = True
    subtitle_uppercase: bool | None = True
    brand_tag: str | None = None

    @field_validator("subtitle_size", mode="before")
    @classmethod
    def parse_size(cls, v):
        if v is None or v == "":
            return 80
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return 80

    @field_validator("width", mode="before")
    @classmethod
    def parse_width(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return None


# ------------------------------------------------------------- preview ----
class PreviewStillIn(BaseModel):
    template_id: int
    fx: str | None = None
    time: float = 0.0
    options_json: dict = Field(default_factory=dict)
    start_time: float | None = None
    end_time: float | None = None


# ----------------------------------------------------------------- cut ----
class VideoCutIn(BaseModel):
    kept_ranges: list[list[float]]
    action: str = "save"  # "save" or "proceed"

