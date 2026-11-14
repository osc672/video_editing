"""FastAPI application entrypoint for AI Reel Editor."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, engine
from .routers import auth, effects, projects, render, subtitles, templates
from .services import effect_engine

logger = logging.getLogger("ai_reel_editor")

app = FastAPI(
    title="AI Reel Editor API",
    description=(
        "Vertical talking-head video editor with 51 effect templates "
        "powered by the claude-video-effects engine by @vibha.in.progress."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(templates.router)
app.include_router(effects.router)
app.include_router(subtitles.router)
app.include_router(render.router)

# Static assets: template placeholder thumbnails and user uploads.
static_root = settings.static_templates_dir.parent
static_root.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_root)), name="static")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    setup = effect_engine.check_setup()
    if not setup["ready"]:
        print(
            "[AI Reel Editor] WARNING: the effects engine is not ready. "
            "Run `python scripts/setup_effects.py` inside the backend folder.\n"
            f"  effects path : {setup['effects_path']}\n"
            f"  python       : {setup['effects_python']}\n"
            f"  ffmpeg found : {setup['ffmpeg']}"
        )
    else:
        print("[AI Reel Editor] Effects engine ready.")
    app.state.cleanup_task = asyncio.create_task(_cleanup_loop())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    task = getattr(app.state, "cleanup_task", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


async def _cleanup_loop() -> None:
    """Delete uploads and renders that are older than the configured age."""
    from .services.render_pipeline import cleanup_old_files

    while True:
        try:
            await asyncio.sleep(3600)
            result = await cleanup_old_files()
            if result.get("removed"):
                logger.info("Cleanup removed %s old file(s).", result["removed"])
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Cleanup task failed")


@app.get("/api/health")
def health() -> dict:
    setup = effect_engine.check_setup()
    return {
        "status": "ok",
        "effects_ready": setup["ready"],
        "effects": setup,
        "database": settings.database_url.rsplit("@", 1)[-1],
    }


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "name": "AI Reel Editor",
            "docs": "/docs",
            "effects_ready": effect_engine.check_setup()["ready"],
        }
    )


@app.exception_handler(500)
async def internal_error(_request, exc):  # noqa: ANN001
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {exc}"})
