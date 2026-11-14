"""Wrapper around the vendored effects engine (github.com/Vibha-Ramprakash/claude-video-effects).

The engine is ALWAYS invoked as a subprocess using the interpreter from the
engine's own virtualenv - the scripts are never imported into this process.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sys
from pathlib import Path

from ..config import settings

# Effects that move the camera. They should come first in a plan when their
# windows overlap other effects (rule from the engine's SKILL.md).
CAMERA_FX = {"locked-on", "lean-in", "spotlight", "slow-push", "over-the-shoulder-zoom"}

# Engine aliases -> canonical name (mirrors ALIASES in scripts/fx.py).
ALIASES = {
    "the-noise": "noise", "the-lineup": "lineup", "bill": "the-bill", "to-do": "todo",
    "the-todo": "todo", "the-to-do": "todo", "the-tap": "tap", "follow": "tap",
    "comment": "comment-box", "pause": "pause-point", "pause-and-point": "pause-point",
    "backdrop": "backdrop-word", "stamp": "reject-stamp", "countdown": "countdown-flip",
    "cover": "cover-star", "rain": "shortcut-rain", "glass": "glass-widgets",
    "widgets": "glass-widgets", "collage": "red-collage", "split": "split-headline",
    "pastel": "pastel-word", "pills": "check-pills", "auto-edit": "timeline",
    "headline": "headline-box", "wall": "profile-wall", "tiers": "tier-list",
    "tier": "tier-list", "broll": "broll-split", "b-roll": "broll-split",
    "fan": "phone-fan", "dots": "dot-reveal", "headlines": "headline-wall",
    "tasks": "checklist", "liquid-glass": "liquid-glass-graph",
    "glass-graph": "liquid-glass-graph", "carousel": "carousel-spin", "match": "match-cut",
    "toggles": "apple-toggles", "led": "led-sign", "push": "slow-push",
    "push-in": "slow-push", "ots": "over-the-shoulder-zoom",
    "shoulder-zoom": "over-the-shoulder-zoom", "corner-zoom": "over-the-shoulder-zoom",
    "tape": "tape-label", "select": "select-resize", "resize": "select-resize",
    "trim": "wave-trim", "strike": "huge-strike", "crayon": "crayon-write",
    "deal": "fan-build", "imessage": "messages", "texts": "messages",
    "notifications": "messages", "grid": "place-in-grid", "profile-grid": "place-in-grid",
}

# Named "looks" that are really another effect plus a look option.
LOOK_NAMES = {"glitter-spotlight": ("spotlight", "sparkle"), "glitter": ("spotlight", "sparkle")}


class EffectEngineError(RuntimeError):
    """Raised when the effects engine exits with an error."""


def effects_root() -> Path:
    return Path(settings.effects_path)


def fx_script() -> Path:
    return effects_root() / "scripts" / "fx.py"


def words_script() -> Path:
    return effects_root() / "scripts" / "words.py"


def effects_python() -> str:
    """Path to the interpreter inside the engine's virtualenv."""
    if settings.effects_python:
        return settings.effects_python
    root = effects_root()
    for candidate in (root / ".venv" / "Scripts" / "python.exe", root / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def engine_installed() -> bool:
    return fx_script().exists() and Path(effects_python()).exists()


def canonical_fx(name: str) -> str:
    key = (name or "").strip().lower().lstrip("/")
    return ALIASES.get(key, key)


def check_setup() -> dict:
    """Report on the engine installation so the UI can show a helpful message."""
    root = effects_root()
    py = effects_python()
    ffmpeg = shutil.which("ffmpeg")
    return {
        "effects_path": str(root),
        "effects_python": py,
        "effects_script_exists": fx_script().exists(),
        "python_exists": Path(py).exists(),
        "ffmpeg": bool(ffmpeg),
        "ffmpeg_path": ffmpeg or "",
        "ready": engine_installed() and bool(ffmpeg),
    }


async def run_engine(
    args: list[str], timeout: int | None = None, cwd: Path | None = None
) -> tuple[int, str, str]:
    """Invoke scripts/fx.py with the engine interpreter."""
    cmd = [effects_python(), str(fx_script()), *args]
    env = dict(os.environ)
    env.setdefault("WHISPER_MODEL", settings.whisper_model)
    eff_timeout = timeout or settings.render_timeout_seconds
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd or effects_root()),
            env=env,
        )
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(), timeout=eff_timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise EffectEngineError(
                f"The effects engine timed out after {eff_timeout}s."
            )
        return (
            proc.returncode or 0,
            out.decode("utf-8", "replace"),
            err.decode("utf-8", "replace"),
        )
    except NotImplementedError:
        import subprocess

        def _sync_run():
            res = subprocess.run(
                cmd,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                cwd=str(cwd or effects_root()),
                env=env,
                timeout=eff_timeout,
            )
            return (
                res.returncode or 0,
                res.stdout.decode("utf-8", "replace"),
                res.stderr.decode("utf-8", "replace"),
            )

        try:
            return await asyncio.to_thread(_sync_run)
        except subprocess.TimeoutExpired:
            raise EffectEngineError(
                f"The effects engine timed out after {eff_timeout}s."
            )


def write_plan(plan: dict, path: str | Path) -> Path:
    """Write a plan file as UTF-8 *without* a BOM (the engine's json.load
    chokes on a BOM, which is what PowerShell's `Set-Content -Encoding utf8`
    writes on Windows)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(plan, fh, ensure_ascii=False)
    return path


def build_plan_argv(plan_path: Path, src: Path, dst: Path, width: int | None = None) -> list[str]:
    argv = ["--plan", str(plan_path), str(src), str(dst)]
    if width:
        argv += ["--width", str(width)]
    return argv


_PROGRESS = re.compile(r"^\s*([\d.]+)\s*s\s*/\s*([\d.]+)\s*s", re.M)


def parse_progress(stdout: str) -> float | None:
    """Extract a 0-1 progress fraction from the engine's stdout, if present."""
    matches = _PROGRESS.findall(stdout or "")
    if not matches:
        return None
    done, total = matches[-1]
    try:
        total_f = float(total)
        if total_f <= 0:
            return None
        return max(0.0, min(float(done) / total_f, 1.0))
    except ValueError:
        return None


async def render_still(
    plan: dict,
    src: Path,
    dst: Path,
    times: list[float],
    width: int | None = None,
    timeout: int = 600,
) -> tuple[bool, str]:
    """Render one or more check frames with the engine's --still mode."""
    plan_path = write_plan(plan, dst.parent / "still_plan.json")
    argv = ["--plan", str(plan_path), str(src), str(dst)]
    if width:
        argv += ["--width", str(width)]
    argv += ["--still", ",".join(f"{t:.3f}" for t in times)]
    code, out, err = await run_engine(argv, timeout=timeout)
    if code != 0:
        return False, (err or out).strip()[-4000:]
    return True, out


async def render_plan(
    plan: dict,
    src: Path,
    dst: Path,
    plan_path: Path,
    width: int | None = None,
    timeout: int | None = None,
    on_progress=None,
) -> tuple[bool, str]:
    """Render the full plan. `on_progress` is an async callback (fraction, line)."""
    write_plan(plan, plan_path)
    cmd = [effects_python(), str(fx_script()), *build_plan_argv(plan_path, src, dst, width)]
    env = dict(os.environ)
    env.setdefault("WHISPER_MODEL", settings.whisper_model)
    captured: list[str] = []
    eff_timeout = timeout or settings.render_timeout_seconds

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(effects_root()),
            env=env,
        )

        async def pump():
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", "replace").rstrip()
                captured.append(text)
                if on_progress:
                    await on_progress(text)
            await proc.wait()

        try:
            await asyncio.wait_for(pump(), timeout=eff_timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return False, f"The effects engine timed out after {eff_timeout}s."

        if proc.returncode != 0:
            tail = "\n".join(captured[-40:]) or "No output captured."
            return False, "The effects engine failed:\n" + tail
        return True, "\n".join(captured[-10:])
    except NotImplementedError:
        import subprocess

        main_loop = asyncio.get_running_loop()

        def _sync_pump():
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=str(effects_root()),
                env=env,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            for line in iter(proc.stdout.readline, ""):
                text = line.rstrip()
                captured.append(text)
                if on_progress:
                    try:
                        asyncio.run_coroutine_threadsafe(on_progress(text), main_loop)
                    except Exception:
                        pass
            if proc.stdout:
                proc.stdout.close()
            return proc.wait(timeout=eff_timeout)

        try:
            rc = await asyncio.to_thread(_sync_pump)
            if rc != 0:
                tail = "\n".join(captured[-40:]) or "No output captured."
                return False, "The effects engine failed:\n" + tail
            return True, "\n".join(captured[-10:])
        except subprocess.TimeoutExpired:
            return False, f"The effects engine timed out after {eff_timeout}s."


async def word_timings(video: Path, timeout: int = 1800) -> list[dict]:
    """Run scripts/words.py and return [{'w','s','e'}] word timings."""
    cmd = [effects_python(), str(words_script()), str(video)]
    env = dict(os.environ)
    env.setdefault("WHISPER_MODEL", settings.whisper_model)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(effects_root()),
            env=env,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise EffectEngineError("Word detection timed out.")
        if proc.returncode != 0:
            raise EffectEngineError((err or out).decode("utf-8", "replace").strip()[-2000:])
    except NotImplementedError:
        import subprocess

        def _sync_words():
            return subprocess.run(
                cmd,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                cwd=str(effects_root()),
                env=env,
                timeout=timeout,
            )

        try:
            res = await asyncio.to_thread(_sync_words)
            if res.returncode != 0:
                err_text = (res.stderr or res.stdout).decode("utf-8", "replace").strip()[-2000:]
                raise EffectEngineError(err_text)
        except subprocess.TimeoutExpired:
            raise EffectEngineError("Word detection timed out.")

    words_file = video.with_suffix(".words.json")
    if not words_file.exists():
        raise EffectEngineError("The engine did not produce word timings.")
    with words_file.open("r", encoding="utf-8") as fh:
        return json.load(fh)


_WORD_CLEAN = re.compile(r"[^\w\s]", re.UNICODE)


def _clean(text: str) -> str:
    return _WORD_CLEAN.sub("", (text or "").lower()).strip()


def find_word(words: list[dict], needle: str) -> dict | None:
    """Find the word matching `needle` (case and punctuation insensitive).

    Tries, in order: an exact single-word match, a phrase match across
    consecutive words, then a partial match. Partial matches require at least
    three characters so a search for "a" never matches every word that
    happens to contain the letter "a".
    """
    target = _clean(needle)
    if not target or not words:
        return None

    # 1. exact single word
    for w in words:
        if _clean(w.get("w")) == target:
            return w

    # 2. phrase: "one clip" -> the word that starts the phrase
    if " " in target:
        for i in range(len(words)):
            phrase = " ".join(_clean(x.get("w")) for x in words[i : i + 4])
            if phrase.startswith(target):
                return words[i]

    # 3. partial: the spoken word is contained in the search text
    #    ("watch out" -> "watch"), or the search text is contained in the
    #    spoken word ("claudes" -> "claude")
    for w in words:
        clean = _clean(w.get("w"))
        if len(clean) >= 3 and (clean in target or target in clean):
            return w

    return None
