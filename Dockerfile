FROM python:3.11-slim

# Install system dependencies: FFmpeg, OpenGL, glib
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install python packages
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt && \
    pip install --no-cache-dir numpy opencv-python-headless mediapipe && \
    python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

# Copy backend code
COPY backend /app/backend

WORKDIR /app/backend

# Create runtime directories
RUN mkdir -p storage/uploads storage/thumbs storage/renders storage/subtitles storage/previews storage/images storage/static/templates

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

