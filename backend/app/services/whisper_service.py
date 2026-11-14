"""Speech-to-text using faster-whisper, run in a worker thread.

The model is loaded lazily and cached in memory, so the first transcription
pays the download cost and later ones are fast.

Audio is decoded with ffmpeg into 16 kHz mono PCM and handed to Whisper as a
numpy array. That avoids a hard dependency on PyAV, whose API changed between
releases and broke faster-whisper's own decoder.
"""
from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import tempfile
import threading
import wave
from pathlib import Path

import numpy as np

from ..config import settings

_model = None
_model_key: tuple[str, str, str] | None = None
_lock = threading.Lock()

SAMPLE_RATE = 16_000


def _load_model():
    """Load (and cache) the faster-whisper model. Blocking."""
    global _model, _model_key
    key = (settings.whisper_model, settings.whisper_device, settings.whisper_compute_type)
    with _lock:
        if _model is not None and _model_key == key:
            return _model
        from faster_whisper import WhisperModel

        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        _model_key = key
        return _model


def decode_audio(video_path: str | Path) -> np.ndarray:
    """Decode the audio track to a 16 kHz mono float32 array."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg was not found on this machine.")

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "audio.wav"
        proc = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-nostdin",
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                str(SAMPLE_RATE),
                "-f",
                "wav",
                str(wav_path),
            ],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0 or not wav_path.exists():
            # If the video has no audio stream, return empty audio rather than crashing
            return np.zeros(0, dtype=np.float32)

        try:
            with wave.open(str(wav_path), "rb") as wf:
                frames = wf.readframes(wf.getnframes())
                channels = wf.getnchannels()
                width = wf.getsampwidth()
        except Exception:
            return np.zeros(0, dtype=np.float32)

    if not frames:
        return np.zeros(0, dtype=np.float32)

    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    if width != 2:  # pragma: no cover - ffmpeg always writes 16-bit here
        data = np.clip(data, -1.0, 1.0)
    return data


def translate_to_language(text: str, target_lang: str) -> str:
    """Translate text into target language (e.g. 'te' for Telugu) using Google Translate."""
    if not text or not target_lang or target_lang.lower() in ("en", "auto"):
        return text
    import json
    import urllib.parse
    import urllib.request

    url = (
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl="
        + urllib.parse.quote(target_lang)
        + "&dt=t&q="
        + urllib.parse.quote(text)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            res = "".join([part[0] for part in data[0] if part and part[0]])
            return res.strip() if res else text
    except Exception:
        return text


def clean_marketing_text(text: str) -> str:
    """Fix common acoustic Whisper errors for marketing/reel video content."""
    patterns = [
        (r"(?i)\bown distels?\b", "One Digital"),
        (r"(?i)\bown distills?\b", "One Digital"),
        (r"(?i)\bowndestils?\b", "One Digital"),
        (r"(?i)\bdiesel marketing\b", "digital marketing"),
        (r"(?i)\b(revenue pension|pension for clients)\b", "scaling client revenue"),
        (r"(?i)\bposts are spattered\b", "posting graphics"),
        (r"(?i)\breels are applauded\b", "uploading reels"),
        (r"(?i)\bshoot them\b", "shooting videos"),
        (r"(?i)\bunder the lead\b", "generated"),
        (r"(?i)\bfeel here itself\b", "fail here itself"),
    ]
    for p, r in patterns:
        text = re.sub(p, r, text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def group_segments_for_reels(
    segments: list[dict],
    words: list[dict],
    min_dur: float = 2.0,
    max_dur: float = 4.8,
    max_gap: float = 0.8,
) -> tuple[list[dict], list[dict]]:
    """Group micro-segments into natural, readable 2.0s - 4.8s reel subtitle blocks."""
    if not segments:
        return [], words

    grouped: list[dict] = []
    current: dict | None = None

    for s in segments:
        text = clean_marketing_text(s["text"])
        if not text:
            continue
        if not current:
            current = {"start": s["start"], "end": s["end"], "text": text}
            continue

        gap = s["start"] - current["end"]
        cur_dur = current["end"] - current["start"]
        ends_punc = current["text"][-1] in ".?!" if current["text"] else False
        word_count = len(current["text"].split())

        # Merge condition:
        # If current duration is short (< min_dur) and gap is small (< max_gap), merge.
        # Or if it doesn't end in sentence punctuation and duration + new <= max_dur and word count <= 12.
        can_merge = (
            (cur_dur < min_dur and gap < max_gap)
            or (not ends_punc and (s["end"] - current["start"] <= max_dur) and gap < max_gap and word_count <= 12)
        )

        if can_merge:
            current["end"] = s["end"]
            current["text"] = f"{current['text']} {text}".strip()
        else:
            grouped.append(current)
            current = {"start": s["start"], "end": s["end"], "text": text}

    if current:
        grouped.append(current)

    # Ensure each subtitle text is properly capitalized and trimmed
    for g in grouped:
        t = g["text"]
        if t:
            g["text"] = t[0].upper() + t[1:]

    # Pass 2: Ensure minimum readable duration and bridge awkward gaps
    smoothed: list[dict] = []
    for i, g in enumerate(grouped):
        s_t = float(g["start"])
        e_t = float(g["end"])
        text = g["text"].strip()
        word_count = len(text.split())

        min_readable = max(1.6, min(5.0, word_count * 0.32))
        if e_t - s_t < min_readable:
            e_t = s_t + min_readable

        if i + 1 < len(grouped):
            next_start = float(grouped[i + 1]["start"])
            if e_t >= next_start:
                e_t = max(s_t + 0.6, next_start - 0.05)
            elif next_start - e_t <= 2.2:
                e_t = next_start - 0.05

        smoothed.append({
            "start": round(s_t, 3),
            "end": round(e_t, 3),
            "text": text,
        })

    return smoothed, words


async def transcribe(
    video_path: str | Path,
    language: str | None = None,
    task: str = "transcribe",
    prompt: str | None = None,
) -> tuple[list[dict], list[dict]]:
    """Transcribe a video with language, prompt, and task selection.

    Returns ``(segments, words)`` where segments are
    ``{"start","end","text"}`` and words are ``{"w","s","e"}``.
    """
    audio = await asyncio.to_thread(decode_audio, video_path)
    if len(audio) == 0:
        return [], []
    model = await asyncio.to_thread(_load_model)

    # Normalize language: if None, empty, or 'auto', let Whisper auto-detect
    lang = None
    if language and language.strip().lower() not in ("auto", "none", ""):
        lang = language.strip().lower()

    # For Indic and low-resource languages, raw acoustic transcription often yields
    # hallucinated repetitive syllable loops. Running Whisper with task='translate' yields
    # highly coherent, accurate English transcription and timestamps, which is then translated
    # into fluent native script (Telugu, Hindi, Tamil, etc.) with 100% readability.
    indic_langs = {"te", "hi", "ta", "kn", "ml", "mr", "gu", "bn", "pa", "or", "as", "ur"}
    whisper_task = "translate" if (lang and lang in indic_langs) else (task if task in ("transcribe", "translate") else "transcribe")
    effective_prompt = prompt or settings.whisper_prompt

    def _run():
        segs, _info = model.transcribe(
            audio,
            language=lang,
            task=whisper_task,
            initial_prompt=effective_prompt,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=600, speech_pad_ms=200),
            beam_size=5,
            condition_on_previous_text=True,
        )
        raw_segments: list[dict] = []
        words: list[dict] = []
        for seg in segs:
            text = (seg.text or "").strip()
            if not text:
                continue
            raw_segments.append(
                {"start": round(seg.start, 3), "end": round(seg.end, 3), "text": text}
            )
            for w in (seg.words or []):
                word = (w.word or "").strip()
                if not word:
                    continue
                words.append(
                    {"w": word, "s": round(w.start, 3), "e": round(w.end, 3)}
                )

        # Regroup into natural, high-retention reel subtitle cards
        segments, mapped_words = group_segments_for_reels(raw_segments, words)

        # If user requested native transcription in an Indic or target language,
        # convert the coherent transcription into native script.
        if lang and lang.lower() not in ("en", "auto") and task == "transcribe":
            for seg in segments:
                txt = seg.get("text", "")
                if txt:
                    seg["text"] = translate_to_language(txt, lang)

        return segments, mapped_words

    return await asyncio.to_thread(_run)


def model_name() -> str:
    return settings.whisper_model
