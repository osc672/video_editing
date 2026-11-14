"""One-time setup helper for the effects engine.

The engine (github.com/Vibha-Ramprakash/claude-video-effects) ships a
`scripts/setup.sh` that creates a virtualenv and installs mediapipe, opencv,
pillow and numpy. That script is bash-only, so this helper does the same job
from Python and works on Windows, macOS and Linux.

Usage:
    python scripts/setup_effects.py            # install everything that is missing
    python scripts/setup_effects.py --check    # only report what is missing
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
EFFECTS_DIR = BACKEND_DIR / "vendor" / "effects"
REQUIREMENTS = EFFECTS_DIR / "requirements.txt"
SETUP_SH = EFFECTS_DIR / "scripts" / "setup.sh"

IS_WINDOWS = os.name == "nt"


def venv_python(root: Path) -> Path:
    return root / ".venv" / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


def check() -> dict:
    report = {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "ffprobe": shutil.which("ffprobe") is not None,
        "effects_repo": EFFECTS_DIR.exists(),
        "fx_script": (EFFECTS_DIR / "scripts" / "fx.py").exists(),
        "venv": venv_python(EFFECTS_DIR).exists(),
        "deps": False,
        "python_version": sys.version.split()[0],
    }
    py = venv_python(EFFECTS_DIR)
    if py.exists():
        try:
            proc = subprocess.run(
                [str(py), "-c", "import mediapipe, cv2, PIL, numpy; print('OK')"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            report["deps"] = "OK" in proc.stdout
        except (OSError, subprocess.SubprocessError):
            report["deps"] = False
    return report


def print_report(report: dict) -> None:
    print("\n=== Effects engine setup ===")
    print(f"  effects repo   : {'OK' if report['effects_repo'] else 'MISSING'}  ({EFFECTS_DIR})")
    print(f"  fx.py          : {'OK' if report['fx_script'] else 'MISSING'}")
    print(f"  ffmpeg         : {'OK' if report['ffmpeg'] else 'MISSING'}")
    print(f"  ffprobe        : {'OK' if report['ffprobe'] else 'MISSING'}")
    print(f"  virtualenv     : {'OK' if report['venv'] else 'MISSING'}")
    print(f"  dependencies   : {'OK' if report['deps'] else 'MISSING'}  (mediapipe, opencv, pillow, numpy)")
    print()


def clone_repo() -> bool:
    if EFFECTS_DIR.exists():
        print(f"[setup] repo already present at {EFFECTS_DIR}")
        return True
    url = "https://github.com/Vibha-Ramprakash/claude-video-effects"
    print(f"[setup] cloning {url}")
    target = EFFECTS_DIR.parent / "effects"
    proc = subprocess.run(["git", "clone", url, str(target)], capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"[setup] git clone failed:\n{proc.stderr}")
        return False
    return True


def create_venv() -> Path | None:
    py = venv_python(EFFECTS_DIR)
    if py.exists():
        print(f"[setup] virtualenv already present: {py}")
        return py
    print("[setup] creating virtualenv ...")
    proc = subprocess.run([sys.executable, "-m", "venv", str(EFFECTS_DIR / ".venv")])
    if proc.returncode != 0:
        print("[setup] could not create the virtualenv.")
        return None
    return py


def install_deps(py: Path) -> bool:
    print("[setup] installing requirements (this can take a few minutes) ...")
    subprocess.run([str(py), "-m", "pip", "install", "--upgrade", "pip"], check=False)
    proc = subprocess.run(
        [str(py), "-m", "pip", "install", "-r", str(REQUIREMENTS)], capture_output=True, text=True
    )
    if proc.returncode != 0:
        print(f"[setup] pip install failed:\n{proc.stdout[-3000:]}\n{proc.stderr[-3000:]}")
        return False

    print("[setup] installing faster-whisper (used for word timing) ...")
    subprocess.run([str(py), "-m", "pip", "install", "faster-whisper"], check=False)

    # PyAV 15+ removed the `metadata_errors` keyword that faster-whisper's own
    # audio decoder still passes, which breaks scripts/words.py in the engine.
    # 13.1.0 is the last version with a prebuilt wheel for Python 3.12.
    print("[setup] pinning av==13.1.0 (newer PyAV breaks the engine's word timing) ...")
    subprocess.run([str(py), "-m", "pip", "install", "av==13.1.0"], check=False)

    print("[setup] installing requests (faster-whisper downloads models with it) ...")
    subprocess.run([str(py), "-m", "pip", "install", "requests"], check=False)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up the claude-video-effects engine.")
    parser.add_argument("--check", action="store_true", help="only report the current status")
    args = parser.parse_args()

    report = check()
    print_report(report)

    if args.check:
        return 0 if (report["fx_script"] and report["deps"] and report["ffmpeg"]) else 1

    if not report["ffmpeg"] or not report["ffprobe"]:
        print(
            "[setup] NEED_FFMPEG: install ffmpeg first.\n"
            "         Windows : winget install ffmpeg\n"
            "         macOS   : brew install ffmpeg\n"
            "         Linux   : sudo apt install ffmpeg"
        )
        return 1

    if not report["effects_repo"] or not report["fx_script"]:
        if not clone_repo():
            print("[setup] NEED_GIT: install git and clone the repo manually into backend/vendor/effects")
            return 1

    if not report["venv"]:
        py = create_venv()
        if not py:
            print("[setup] NEED_PYTHON: install Python 3.10+ and try again.")
            return 1
    else:
        py = venv_python(EFFECTS_DIR)

    if not report["deps"]:
        if not install_deps(py):
            return 1

    final = check()
    print_report(final)
    if final["deps"] and final["fx_script"] and final["ffmpeg"]:
        print("READY")
        print(f"Engine python: {venv_python(EFFECTS_DIR)}")
        return 0
    print("Setup incomplete. See the messages above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
