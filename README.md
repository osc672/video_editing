# AI Reel Editor

Turn **one vertical talking-head clip** into a finished reel: trim it, auto-generate
subtitles, stack any of **51 effect templates**, render, and download an MP4.

The 51 effects are **not re-implemented here**. They come from the open-source
[`claude-video-effects`](https://github.com/Vibha-Ramprakash/claude-video-effects)
skill by **[@vibha.in.progress](https://instagram.com/vibha.in.progress)**, which this
project clones and drives as a subprocess.

> These are **starter versions** of the effects. They will not match the exact edit
> from the original reel (that also has hand-tuned timing and sound design). Watch the
> result before you post.

---

## Contents

- [What it does](#what-it-does)
- [Screens](#screens)
- [Requirements](#requirements)
- [Setup](#setup)
  - [1. XAMPP / MySQL](#1-xampp--mysql)
  - [2. ffmpeg](#2-ffmpeg)
  - [3. Clone the effects repo](#3-clone-the-effects-repo)
  - [4. Install the backend](#4-install-the-backend)
  - [5. Set up the effects engine](#5-set-up-the-effects-engine)
  - [6. Import the database schema](#6-import-the-database-schema)
  - [7. Seed the 51 templates](#7-seed-the-51-templates)
  - [8. Run both servers](#8-run-both-servers)
- [How the pipeline works](#how-the-pipeline-works)
- [Effect catalog](#effect-catalog)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Configuration](#configuration)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [Test checklist](#test-checklist)
- [Credits and licensing](#credits-and-licensing)

---

## What it does

| Step | Detail |
|---|---|
| **Upload** | Drag an mp4/mov (max 600 MB, vertical preferred). ffmpeg reads the duration, resolution and fps and extracts a 12-frame filmstrip. |
| **Trim** | Two cyan handles on a pixel-accurate filmstrip, plus numeric in/out fields. Handles snap to 0.1 s. |
| **Subtitles** | faster-whisper transcribes the clip automatically. Edit, retime, add and delete blocks on a track that shares the timeline scale. |
| **Template gallery** | All 51 effects with thumbnails, search and category filters. |
| **Options form** | Built dynamically from each template's `options_json` schema: text fields, `|`-separated list editors, colour pickers, number inputs, dropdowns and an image uploader. |
| **Effect windows** | Draggable coloured bars on the timeline. Multiple effects per project, each with its own template, options and window. |
| **Land on a word** | The crosshair button on an effect resolves when you say a word (the engine's `words.py`) and snaps the window to it. |
| **Preview frame** | Renders the chosen effect on the current frame with the engine's `--still` mode, so you can check a look before committing to a full render. |
| **Render** | Background job: trim → plan → check frames → render → burn subtitles → done. Live progress with stage names. |
| **Download** | `Download MP4`, `Edit again`, `Try another template`. |

---

## Screens

| Page | Route | What you see |
|---|---|---|
| Login | `/login` | Sign in / register, deep-blue gradient, cyan accent. |
| Upload | `/upload` | Drag-and-drop dropzone with a live progress bar. |
| Editor | `/editor/:projectId` | Gallery · 9:16 preview · effect stack · options form · filmstrip timeline · subtitle track. |
| Result | `/result/:projectId` | Rendered video, download button, render details. |

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10+ (3.11/3.12 tested) | Backend + effects engine virtualenv. |
| Node.js | 18+ (22/24 tested) | Frontend. |
| MySQL / MariaDB | 5.7+ / 10.4+ | XAMPP ships MariaDB 10.4. **This machine uses port 3307.** |
| ffmpeg | 5+ | Must be on `PATH` (`ffmpeg` and `ffprobe`). |
| git | any | To clone the effects repo. |

> **Python 3.12 note.** The effects repo's `scripts/setup.sh` looks for Python 3.10–3.13.
> `backend/scripts/setup_effects.py` does the same job from Python and works on
> Windows, macOS and Linux.

---

## Setup

### 1. XAMPP / MySQL

1. Open the XAMPP Control Panel and press **Start** next to **MySQL**.
2. Check which port it uses. The XAMPP default is `3306`; **this machine is configured
   for `3307`**. You can find it in `C:\xampp\mysql\bin\my.ini` (`port = 3307`) or by
   running `netstat -ano | findstr 330`.
3. Confirm the server is up:

   ```bash
   C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root -e "SELECT VERSION();"
   ```

   The default XAMPP `root` user has **no password**.

### 2. ffmpeg

```bash
# Windows
winget install ffmpeg
# macOS
brew install ffmpeg
# Debian/Ubuntu
sudo apt install ffmpeg
```

Verify: `ffmpeg -version` and `ffprobe -version` must both work.

### 3. Clone the effects repo

```bash
cd backend
git clone https://github.com/Vibha-Ramprakash/claude-video-effects vendor/effects
```

### 4. Install the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # macOS / Linux

pip install -r requirements.txt
cp .env.example .env        # Windows
# cp .env.example .env      # macOS / Linux
```

Open `backend/.env` and check `DATABASE_URL` matches your MySQL port:

```env
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3307/ai_video_editor
```

### 5. Set up the effects engine

The repo ships a bash-only `scripts/setup.sh`. This helper does the same job from
Python and works everywhere:

```bash
cd backend
python scripts/setup_effects.py
```

It will:

- check for `ffmpeg` / `ffprobe` and tell you what is missing,
- clone the repo if `vendor/effects` is absent,
- create `vendor/effects/.venv`,
- install `numpy`, `opencv-python`, `pillow`, `mediapipe` and `faster-whisper`,
- print **`READY`** when everything is in place.

Check only the status without changing anything:

```bash
python scripts/setup_effects.py --check
```

### 6. Import the database schema

Either import `backend/schema.sql` through **phpMyAdmin → Import**, or from a terminal:

```bash
mysql -u root -P 3307 < backend/schema.sql
```

The script creates the `ai_video_editor` database and all six tables
(`users`, `projects`, `subtitles`, `templates`, `project_effects`, `render_jobs`).

> The backend also calls `Base.metadata.create_all()` on startup, so the tables are
> created automatically if they are missing. `schema.sql` is there for phpMyAdmin.

### 7. Seed the 51 templates

```bash
cd backend
python -m app.seed.seed_templates
```

Expected output:

```
Seeded 51 templates (51 new, 0 updated).
Done. 51 templates available in the gallery.
```

Generate the gallery placeholder thumbnails (a gradient card with the number and
name for every effect):

```bash
python scripts/generate_template_thumbnails.py
```

### 8. Run both servers

**Backend** (port 8000):

```bash
cd backend
uvicorn app.main:app --reload
```

You should see:

```
[AI Reel Editor] Effects engine ready.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

**Frontend** (port 5173) in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**, register an account and upload a clip.

---

## How the pipeline works

The backend never imports the effects scripts — it always calls them as a
subprocess using the engine's own virtualenv interpreter.

```
                    ┌───────────────────────────────┐
  upload ──────────▶│  ffmpeg: trim + filmstrip     │
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  plan_builder → plan.json     │  effect windows and
                    │  (times shifted by trim)      │  subtitle times are
                    └───────────────┬───────────────┘  made relative to the
                                    ▼                 trimmed video
                    ┌───────────────────────────────┐
                    │  fx.py --plan … --still …     │  fast check frame of
                    │  (one frame per effect)       │  every effect
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  fx.py --plan … in.mp4 out.mp4│  the real render
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  ffmpeg: burn ASS subtitles   │  only when "burn
                    └───────────────┬───────────────┘  subtitles" is on
                                    ▼
                            final.mp4 → download
```

**Plan file** (`backend/storage/renders/project_<id>/plan.json`):

```json
{"effects": [
  {"fx": "red-collage", "start": 0.5, "end": 4.0,
   "text": "CLAUDE", "lines": "ONE CLIP|34 EFFECTS|ZERO APPS"}
]}
```

All option values are strings. Lists use `|` as the separator.

**Engine commands used** (all relative to `backend/vendor/effects`):

```bash
# plan render
<effects_python> scripts/fx.py --plan plan.json input.mp4 output.mp4

# single effect
<effects_python> scripts/fx.py red-collage input.mp4 out.mp4 \
    --start 3 --end 6 --text "CLAUDE" --opt "lines=ONE CLIP|34 EFFECTS"

# check frames
<effects_python> scripts/fx.py --plan plan.json input.mp4 check.png --still 4.5,15.2

# word timings ("on the word X")
<effects_python> scripts/words.py input.mp4

# 4K instead of 1080p
... --width 2160
```

`<effects_python>` is `backend/vendor/effects/.venv/Scripts/python.exe` on Windows
and `backend/vendor/effects/.venv/bin/python` on macOS / Linux. It is auto-detected;
override it with `EFFECTS_PYTHON` in `.env`.

### Engine rules the app enforces

- **Short windows look best** — 1.5 s to 4 s per effect. Windows longer than 6 s are
  allowed but flagged with a `long` badge on the timeline bar.
- **Effects run in list order.** Camera effects (`locked-on`, `lean-in`, `spotlight`,
  `slow-push`, `over-the-shoulder-zoom`) are moved ahead of the effects they overlap.
- **Zoom never goes above 2.** The options form caps zoom options at 2.
- **The output keeps the original audio.** The engine adds visuals only — no captions.
  Subtitles are a separate feature burned in afterwards with ffmpeg.
- **Plan files are written without a BOM.** PowerShell's `Set-Content -Encoding utf8`
  adds a BOM, which makes the engine's `json.load` fail — the backend always writes
  UTF-8 without one.

---

## Effect catalog

All 51 effects are seeded from `backend/app/seed/catalog.json`.

| # | `fx` | What it does | Options |
|---|---|---|---|
| 1 | `noise` | Reels pile up behind your head | images, size |
| 2 | `lineup` | Numbered tiles fan out above your head | text (list) |
| 3 | `locked-on` | Brackets lock onto your face | zoom (1.35), text |
| 4 | `orbit` | Your reels circle your head | images, count, speed, size |
| 5 | `lean-in` | A fast punch-in on one word | zoom (1.45, max 2), speed |
| 6 | `backdrop-word` | A giant word drops in behind you | text, color, font (bold/serif) |
| 7 | `spotlight` | Lights out, you stay lit | text, color, push, look (`sparkle`) |
| 8 | `the-bill` | Instructions print like a receipt | text (list) |
| 9 | `moody` | A moody colour grade | grade (moody/bw/warm/cool/pop) |
| 10 | `swipe` | A before/after slider sweeps across | grade |
| 11 | `todo` | A checklist card ticks off beside you | text (list), ticks (list), title |
| 12 | `comment-box` | An Instagram comment types itself | text |
| 13 | `tap` | A Follow button flips to Following | at, x, y, color |
| 14 | `pause-point` | Freeze frame with a hand-drawn arrow | text, color, label_x |
| 15 | `uninstall` | A glitchy uninstall bar breaks the frame | text |
| 16 | `reel-frame` | Your video shrinks into a reel card | text |
| 17 | `shortcut-rain` | Keyboard keys rain behind you | text (list), count |
| 18 | `reject-stamp` | A big red stamp slams on | text, color, angle, y |
| 19 | `countdown-flip` | A 3, 2, 1 flip clock | from |
| 20 | `rabbit-hole` | The frame tunnels into itself | ratio, speed, spin |
| 21 | `cover-star` | You become a magazine cover | text, lines, issue, color, look (`editorial`), accent, right, lines_y, right_y |
| 22 | `scribble` | Marker doodles draw around you | text, color |
| 23 | `glass-widgets` | Frosted glass widgets float around you | text, name, handle, look (`simple`) |
| 24 | `red-collage` | B&W you, a giant red word behind | text, lines, tag |
| 25 | `split-headline` | A headline card pushes you down | text (list), hl, pill |
| 26 | `pastel-word` | Lavender room, giant word, follow card | text, name, handle |
| 27 | `check-pills` | Grid-paper room, cursor clicks pills | text (list), images |
| 28 | `timeline` | Dark red grade with an editing timeline | text, sub, tc |
| 29 | `headline-box` | Punch-in with a two-line headline | text (list), zoom |
| 30 | `profile-wall` | Your reels grid fills the wall | images, count, label |
| 31 | `tier-list` | A tier list drops in, Claude flies to S | title, item, others (list) |
| 32 | `broll-split` | B-roll on top with a price sticker | images, text |
| 33 | `phone-fan` | Your reels fan out like phones | images, text (list) |
| 34 | `dot-reveal` | Your shot builds from glowing dots | color, cell |
| 35 | `headline-wall` | Your headlines pile up behind you | text (list), total, label |
| 36 | `checklist` | A task list under your chin | text (list), title |
| 37 | `liquid-glass-graph` | A glass card with a climbing graph | text, from, to, color, look (`bento`), donut, kpi, bars |
| 38 | `carousel-spin` | Your reels spin in a 3D carousel | images, count, size, turns |
| 39 | `match-cut` | News pages cut on one word | text, color |
| 40 | `apple-toggles` | An iPhone settings card flips switches | text (list), ticks (list), color, pos, overlap, zoom |
| 41 | `led-sign` | The lights drop, an LED sign types itself | text (list), color, push |
| 42 | `slow-push` | A slow cinematic push-in | zoom (1.6), blur |
| 43 | `over-the-shoulder-zoom` | Camera pushes to a corner, glass graph | text (list), to (list), zoom (2.0) |
| 44 | `messages` | iMessage notifications stack up | text (list), title, y |
| 45 | `place-in-grid` | You shrink into a 3x3 profile grid | images, views (list) |
| 46 | `tape-label` | Yellow tape with your line on your chest | text |
| 47 | `select-resize` | A selection box drags your number bigger | text |
| 48 | `wave-trim` | A voice panel; the silence collapses | none |
| 49 | `huge-strike` | A huge serif word wipes in and is struck out | text, at |
| 50 | `crayon-write` | A red crayon writes your word | text |
| 51 | `fan-build` | Reel covers deal into a fan | images, count (13) |

**Aliases** the engine accepts: `bill`, `to-do`, `follow`, `stamp`, `countdown`,
`cover`, `rain`, `pause` (plus many more).

**Categories** used in the gallery:

| Category | Effects |
|---|---|
| Camera | 3, 5, 7, 42, 43 |
| Text/Headline | 6, 24, 25, 29, 39, 41, 46, 49, 50 |
| UI/Social | 12, 13, 16, 23, 26, 44, 45, 47 |
| Lists/Data | 2, 8, 11, 19, 31, 35, 36, 37, 40 |
| Reels/Images | 1, 4, 27, 30, 32, 33, 38, 51 |
| Grade/Transitions | 9, 10, 20, 34, 48 |
| Fun | 14, 15, 17, 18, 21, 22, 28 |

### Image-based effects

Seven effects use your own images: `noise`, `orbit`, `check-pills`, `profile-wall`,
`broll-split`, `phone-fan`, `carousel-spin`, `place-in-grid`, `fan-build`.

They show an **IMG** badge in the gallery. Until you upload **at least 3 images** the
app refuses to add them to the timeline and refuses to start the render, with a clear
message. Upload reel covers or screenshots in the options form.

### Smart defaults

Every template ships with sensible defaults, so one click already looks good:

| Template | Default |
|---|---|
| `red-collage` | text `CLAUDE`, lines `ONE CLIP\|34 EFFECTS\|ZERO APPS` |
| `backdrop-word` | text `CLAUDE`, font `bold` |
| `timeline` | text `EFFECTS`, tc `REC` |
| `checklist` | title `Claude is editing your clip`, 5 steps |
| `fan-build` | count `13` |
| `select-resize` | text `2X` |
| `huge-strike` | text `8 HOURS`, at `0.6` |

---

## API reference

Interactive docs: **http://127.0.0.1:8000/docs**

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account → `{access_token, user}` |
| `POST` | `/api/auth/login` | Sign in → `{access_token, user}` |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/projects/upload` | Upload a video (multipart) |
| `GET` | `/api/projects/{id}` | Project metadata |
| `PATCH` | `/api/projects/{id}` | Update trim range / burn subtitles |
| `GET` | `/api/projects/{id}/thumbnails` | Filmstrip frame list |
| `GET` | `/api/projects/{id}/video` | Stream the source video |
| `GET` | `/api/projects/{id}/images` | List uploaded effect images |
| `POST` | `/api/projects/{id}/images` | Upload effect images (multipart) |
| `DELETE` | `/api/projects/{id}/images/{name}` | Delete one image |
| `POST` | `/api/projects/{id}/preview-still` | Render one check frame (PNG) |
| `POST` | `/api/projects/{id}/word-timing` | Resolve when a word is spoken (uses `words.py`) |
| `POST` | `/api/projects/{id}/subtitles/transcribe` | Start transcription |
| `GET` | `/api/projects/{id}/subtitles` | List subtitle blocks |
| `PUT` | `/api/projects/{id}/subtitles` | Replace the subtitle track |
| `DELETE` | `/api/projects/{id}/subtitles/{sid}` | Delete one block |
| `GET` | `/api/templates` | All templates (`?category=`, `?search=`) |
| `GET` | `/api/templates/{id}` | One template |
| `GET` | `/api/projects/{id}/effects` | List the project's effects |
| `PUT` | `/api/projects/{id}/effects` | Replace the effect list |
| `POST` | `/api/projects/{id}/render` | Start a render → job |
| `GET` | `/api/render/{job_id}` | Job status / progress |
| `GET` | `/api/render/{job_id}/download` | Download the MP4 |
| `GET` | `/api/projects/{id}/renders` | Render history |
| `GET` | `/api/health` | Backend + engine status |

All routes except `/api/auth/*`, `/api/templates*` and `/api/health` need
`Authorization: Bearer <token>`.

> **Media routes** (`/video`, `/thumbnails/*`, `/images/*`) also accept the JWT as a
> `?token=` query parameter, because a plain `<video src>` cannot send an
> `Authorization` header.

---

## Database schema

`backend/schema.sql` — also mirrored by the SQLAlchemy models in `backend/app/models.py`.

| Table | Columns |
|---|---|
| `users` | id, name, email (unique), password_hash, created_at |
| `projects` | id, user_id → users, original_filename, video_path, duration, width, height, fps, trim_start, trim_end, burn_subtitles, status, created_at |
| `subtitles` | id, project_id → projects, start_time, end_time, text, words_json |
| `templates` | id, number (unique), fx (unique), name, category, description, options_json, needs_images, thumbnail_url, enabled |
| `project_effects` | id, project_id → projects, template_id → templates, start_time, end_time, options_json, order_index |
| `render_jobs` | id, project_id → projects, progress, stage, status, output_path, error, queue_position, created_at, finished_at |

`status` on `projects`: `uploaded | transcribing | ready | rendering | done | failed`.

`options_json` is a list of
`{key, label, type, default, enum_values}` where `type` is one of
`text | list | color | number | enum | images`.

Passwords are hashed with **PBKDF2-HMAC-SHA256** (260 000 iterations, random salt)
and authenticated with **JWT**.

---

## Configuration

`backend/.env` (copy from `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql+pymysql://root:@127.0.0.1:3307/ai_video_editor` | Use your MySQL port. |
| `JWT_SECRET` | change-me | Set a long random string. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | 7 days. |
| `MAX_UPLOAD_MB` | `500` | Upload limit. |
| `WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large-v3`. |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda`. |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` on CPU, `float16` on CUDA. |
| `EFFECTS_PATH` | `./vendor/effects` | Relative paths resolve against `backend/`. |
| `EFFECTS_PYTHON` | *(auto)* | Override the engine interpreter. |
| `EFFECTS_WIDTH` | `1080` | `2160` for 4K (much slower). |
| `RENDER_TIMEOUT_SECONDS` | `900` | Renders fail after 15 minutes. |
| `MAX_GLOBAL_RENDERS` | `3` | Global queue limit. |
| `RENDER_WORKERS` | `2` | Renders running at once. |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed frontends. |
| `CLEANUP_AFTER_HOURS` | `24` | Uploads and renders older than this are deleted hourly. |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause the preview |
| `←` / `→` | Nudge the playhead by 0.1 s (`Shift` = 1 s) |
| `Delete` / `Backspace` | Delete the selected subtitle block |

---

## Troubleshooting

**"The effects engine is not ready."**
Run `python scripts/setup_effects.py` inside `backend/`. Check
`http://127.0.0.1:8000/api/health` — `effects_ready` must be `true`.

**`NEED_FFMPEG` / `NEED_PYTHON`**
Install ffmpeg and put it on `PATH`. Re-run `python scripts/setup_effects.py`.

**`Unknown effect 'x'. Run --list to see all 51.`**
The `fx` name in `plan.json` is wrong. Aliases are handled by
`effect_engine.canonical_fx()`; a raw name is not.

**The render fails with a JSON decode error.**
The plan file has a UTF-8 BOM. It must be written without one — the backend always
does this, so this only happens if you hand-edit `plan.json` with PowerShell.

**Transcription fails with `open() got an unexpected keyword argument 'metadata_errors'`.**
PyAV 15+ removed a keyword that faster-whisper's own audio decoder still passes, which
breaks the vendored engine's `scripts/words.py`. `scripts/setup_effects.py` pins
`av==13.1.0` in the engine's virtualenv for exactly this reason (13.1.0 is the last
version with a prebuilt wheel for Python 3.12). If you installed the engine by hand,
run `vendor/effects/.venv/Scripts/pip install av==13.1.0`.

The backend itself does not use PyAV — it decodes audio with ffmpeg into 16 kHz mono
PCM — but the backend's `requirements.txt` pins the same version so both virtualenvs
stay in step.

**MySQL connection refused.**
Check the port in `.env` matches your XAMPP MySQL (`netstat -ano | findstr 330`).

**The video does not play in the editor.**
The `<video>` element needs a token; the frontend appends `?token=` automatically.
A 401 in the browser console means an old cached bundle — hard-reload.

**The render is slow.**
The engine renders at 1080p with two passes (face tracking, then compositing). Keep
effect windows short, use one or two effects, and avoid 4K on CPU.

---

## Test checklist

Run through this before shipping:

1. **Upload** — register, upload a vertical mp4, confirm the filmstrip and metadata.
2. **Trim** — drag both cyan handles, type in/out values, press **Save**, reload and
   confirm the range persisted.
3. **Subtitles** — wait for auto-transcription, edit a block's text, drag it, delete
   one, add one, press **Save**.
4. **Template 24 (red-collage)** — pick it, edit `text` / `lines` / `tag`, press
   **Preview frame**, confirm the still shows the red word, then **Start Editing**,
   wait for the render and **Download MP4**.
5. **Template 6 (backdrop-word)** — repeat with `text`, `color` and `font`.
6. **Template 28 (timeline)** — repeat with `text`, `sub`, `tc`.
7. **Template 36 (checklist)** — repeat with the `step::meta` list rows.
8. **An image template** — upload 3+ images, add e.g. template 1 (`noise`) or 51
   (`fan-build`), render, confirm your images appear in the reel.
9. **Multiple effects** — stack two effects, confirm the order in the timeline and
   that both appear in the render.
10. **Subtitle burn** — tick **Burn subtitles**, render, confirm the captions are
    baked into the MP4.

A scripted version of steps 4 and 8 lives in `backend/scripts/` — see
`README` notes in the test files.

---

## Credits and licensing

- **Effects** by **[@vibha.in.progress](https://instagram.com/vibha.in.progress)** —
  [github.com/Vibha-Ramprakash/claude-video-effects](https://github.com/Vibha-Ramprakash/claude-video-effects),
  **MIT licensed**. The engine is used unmodified, as a subprocess.
- **Face tracking**: OpenCV YuNet (MIT). **Person cut-out**: MediaPipe Selfie Segmenter
  (Apache 2.0). **Fonts**: Archivo Black, Instrument Serif, Space Mono, Inter, Anton,
  Montserrat (SIL OFL) and Permanent Marker (Apache 2.0) — see `vendor/effects/fonts/`.
- **Transcription**: faster-whisper (MIT) / Whisper (MIT) by OpenAI.
- **Render**: FFmpeg (LGPL/GPL depending on the build).

> **Check the repository's licence before any commercial use.** The engine's own
> README points at a paid "full studio" edition and asks that the free starter
> versions are credited to the original author. Fonts and models inside the repo
> carry their own separate licences.

This project is not affiliated with or endorsed by the author of the effects skill.

---

## Project structure

```
backend/
  app/
    main.py            FastAPI app, static files, cleanup loop
    config.py          settings (pydantic-settings)
    db.py              engine / session
    models.py          SQLAlchemy models
    schemas.py         Pydantic schemas
    security.py        PBKDF2 hashing, JWT, media-route auth
    routers/           auth, projects, templates, effects, subtitles, render
    services/
      ffmpeg_service.py    probe, trim, thumbnails, ASS subtitles, burn
      whisper_service.py   faster-whisper transcription
      effect_engine.py     subprocess wrapper around scripts/fx.py
      plan_builder.py      user choices -> plan.json
      render_pipeline.py   background render job + queue
      subtitle_burn.py     ASS generation and burn-in
    seed/
      catalog.json         all 51 templates with their option schemas
      seed_templates.py    writes them to the database
  vendor/effects/      the cloned effects repo (gitignored)
  storage/
    uploads/ thumbs/ renders/ subtitles/ previews/ images/ static/templates/
  scripts/
    setup_effects.py                 one-time engine setup (cross-platform)
    generate_template_thumbnails.py placeholder gallery artwork
  schema.sql          MySQL schema for phpMyAdmin
  requirements.txt
  .env.example

frontend/
  src/
    pages/          Login, Upload, Editor, Result
    components/     TemplateGallery, TemplateCard, OptionsForm, VideoPreview,
                    Timeline, TrimHandles, EffectBar, SubtitleTrack, SubtitleBlock,
                    Toolbar, RenderProgress, ImageUploader, ToastProvider
    hooks/          useProject, useTimeline, usePolling
    api/client.js   axios instance + typed API helpers
  index.html
  vite.config.js   (proxies /api and /static to the backend)
```

---

## Troubleshooting the setup helper

`backend/scripts/setup_effects.py` prints exactly what is missing:

```
=== Effects engine setup ===
  effects repo   : OK  (D:\ai video\backend\vendor\effects)
  fx.py          : OK
  ffmpeg         : OK
  ffprobe        : OK
  virtualenv     : OK
  dependencies   : OK  (mediapipe, opencv, pillow, numpy)
```
