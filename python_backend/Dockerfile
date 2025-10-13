# ChordMiniApp Python Backend Dockerfile
# Multi-stage build for optimized Flask ML service deployment

# Stage 1: Builder
FROM python:3.10-slim as builder

# Set working directory
WORKDIR /app

# Install system dependencies including build tools for ML libraries
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libsndfile1-dev \
    ffmpeg \
    git \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements and install Python dependencies
COPY requirements.txt .

# Install build dependencies first for madmom compilation
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir Cython>=0.29.0 numpy==1.26.4
RUN pip install --no-cache-dir madmom>=0.16.1
# Install all requirements except Spleeter first, then install Spleeter without deps to avoid resolver conflicts with librosa/httpx
RUN grep -v '^spleeter==' requirements.txt | grep -v '^typer==' > requirements_nospleeter.txt \
    && pip install --no-cache-dir -r requirements_nospleeter.txt \
    && pip install --no-cache-dir --no-deps typer==0.9.0 \
    && pip install --no-cache-dir --no-deps spleeter==2.3.2

# Stage 2: Runtime
FROM python:3.10-slim as runtime

# Install only runtime system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set working directory
WORKDIR /app

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code and essential files
COPY app.py .
COPY app_factory.py .
COPY config.py .
COPY config/ config/
COPY services/ services/
COPY blueprints/ blueprints/
COPY models/ models/
COPY utils/ utils/
COPY extensions.py .
COPY error_handlers.py .
COPY scipy_patch.py .
COPY compat/ compat/
# Note: BTC models and large Beat-Transformer files excluded via .dockerignore to reduce container size

# Create non-root user for security BEFORE downloading models
RUN useradd --create-home --shell /bin/bash --uid 1001 app \
    && chown -R app:app /app

# Switch to app user to download Spleeter models with correct permissions
USER app

# Pre-download Spleeter models manually using curl (httpx redirect issue workaround)
# Download the 5-stems model (~200MB) and extract to the correct cache location
# Spleeter expects models in /home/app/.cache/spleeter/5stems/ directory
RUN mkdir -p /home/app/.cache/spleeter/5stems && \
    cd /home/app/.cache/spleeter/5stems && \
    echo "⬇️  Downloading Spleeter 5-stems model..." && \
    curl -L -o 5stems.tar.gz https://github.com/deezer/spleeter/releases/download/v1.4.0/5stems.tar.gz && \
    echo "📦 Extracting model files..." && \
    tar -xzf 5stems.tar.gz && \
    rm 5stems.tar.gz && \
    echo "✅ Spleeter 5-stems model downloaded and extracted successfully" && \
    echo "📁 Model files in /home/app/.cache/spleeter/5stems/:" && \
    ls -la /home/app/.cache/spleeter/5stems/

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

# Set environment variables
ENV FLASK_ENV=production
ENV FLASK_DEBUG=False
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Run the application with optimized settings for ML processing
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "600", "--worker-class", "sync", "--max-requests", "1000", "--max-requests-jitter", "100", "app:app"]