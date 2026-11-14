"""Turn the user's effect list into an engine plan.json.

Plan format (see vendor/effects/SKILL.md):
    {"effects": [{"fx": "red-collage", "start": 0.5, "end": 4.0,
                  "text": "CLAUDE", "lines": "ONE CLIP|34 EFFECTS|ZERO APPS"}]}

All option values are strings; lists are pipe separated.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import effect_engine

# Options that must never be sent to the engine.
_SKIP_KEYS = {"images"}  # replaced by the real folder path at render time

# Option types that carry a list of values separated by "|".
LIST_KEYS = {
    "text", "lines", "others", "right", "ticks", "views", "keys", "items",
}

# The engine treats a few options as absolute points on the video timeline
# (`float(v) - e.start`), so they must be shifted when the video is trimmed.
#   todo -> "ticks"   : video seconds when each item is ticked
#   tap  -> "at"      : video second of the follow-button flip
# Everything else (huge-strike "at", apple-toggles "ticks") is relative to the
# start of the effect window and must NOT be shifted.
ABSOLUTE_TIME_OPTIONS: dict[str, dict[str, bool]] = {
    "todo": {"ticks": True},   # value is a "|"-separated list
    "tap": {"at": False},      # value is a single number
}


def _shift_absolute_times(fx: str, options: dict[str, str], delta: float) -> dict[str, str]:
    """Shift absolute video-time option values by `delta` (usually -trim_start)."""
    spec = ABSOLUTE_TIME_OPTIONS.get(fx)
    if not spec or not delta:
        return options
    out = dict(options)
    for key, is_list in spec.items():
        raw = out.get(key)
        if raw is None or raw == "":
            continue
        try:
            if is_list:
                parts = []
                for chunk in str(raw).split("|"):
                    chunk = chunk.strip()
                    parts.append(f"{float(chunk) + delta:.3f}" if chunk else chunk)
                out[key] = "|".join(parts)
            else:
                out[key] = f"{float(raw) + delta:.3f}"
        except ValueError:
            continue
    return out


@dataclass
class EffectPlan:
    fx: str
    start: float
    end: float
    options: dict = field(default_factory=dict)

    def to_dict(self, images_dir: str | None = None) -> dict:
        out: dict = {"fx": self.fx, "start": round(self.start, 3), "end": round(self.end, 3)}
        for key, value in self.options.items():
            if key in _SKIP_KEYS:
                if images_dir:
                    out[key] = images_dir
                continue
            if value is None:
                continue
            out[key] = str(value)

        # Ensure image-based card templates always have their images folder populated
        card_effects = {
            'fan-build', 'noise', 'orbit', 'carousel-spin', 'place-in-grid',
            'check-pills', 'profile-wall', 'phone-fan', 'broll-split', 'timeline'
        }
        if images_dir and (self.fx in card_effects or 'images' in self.options):
            out['images'] = images_dir

        return out


def normalise_options(raw: dict | None) -> dict[str, str]:
    """Coerce every option value to a string the engine understands."""
    out: dict[str, str] = {}
    for key, value in (raw or {}).items():
        if value is None:
            continue
        if isinstance(value, bool):
            out[key] = "1" if value else "0"
        elif isinstance(value, (list, tuple)):
            out[key] = "|".join(str(v) for v in value)
        elif isinstance(value, float):
            out[key] = f"{value:g}"
        else:
            out[key] = str(value)
    return out


def build_plan(
    effects: list[dict],
    *,
    trim_start: float = 0.0,
    trim_end: float | None = None,
    images_dir: str | None = None,
) -> dict:
    """Build a plan from project effects.

    Each effect dict needs: fx, start_time, end_time, options_json.
    Times are shifted so they are relative to the trimmed video.
    """
    plans: list[EffectPlan] = []
    for item in effects:
        fx = effect_engine.canonical_fx(item.get("fx") or "")
        if not fx:
            continue
        start = float(item.get("start_time") or 0.0) - trim_start
        end = float(item.get("end_time") or 0.0) - trim_start
        if trim_end is not None:
            end = min(end, max(trim_end - trim_start, 0.1))
        start = max(start, 0.0)
        end = max(end, start + 0.1)
        options = normalise_options(item.get("options_json"))
        options = _shift_absolute_times(fx, options, -trim_start)
        plans.append(EffectPlan(fx=fx, start=start, end=end, options=options))

    # Engine rule: camera effects must come before the effects they overlap,
    # otherwise the camera move is applied on top of the overlay. Everything
    # else keeps the order the user arranged in the side panel.
    _hoist_camera_effects(plans)

    return {"effects": [p.to_dict(images_dir) for p in plans]}


def _overlaps(a: EffectPlan, b: EffectPlan) -> bool:
    return a.start < b.end and b.start < a.end


def _hoist_camera_effects(plans: list[EffectPlan]) -> None:
    """Move camera effects ahead of the non-camera effects they overlap."""
    for camera in [p for p in plans if p.fx in effect_engine.CAMERA_FX]:
        others = [
            p for p in plans if p is not camera and p.fx not in effect_engine.CAMERA_FX
        ]
        if not any(_overlaps(camera, o) for o in others):
            continue
        # Camera goes first, everything else keeps its relative order.
        plans.remove(camera)
        plans.insert(0, camera)


def plan_to_effects(plan: dict) -> list[dict]:
    return list(plan.get("effects", []))


def effect_midpoint(start: float, end: float) -> float:
    return start + (end - start) / 2.0
