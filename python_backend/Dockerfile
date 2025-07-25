# ChordMiniApp Python Backend Dockerfile
# Multi-stage build for optimized Flask ML service deployment

# Stage 1: Builder
FROM python:3.9-slim as builder

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
RUN pip install --no-cache-dir Cython>=0.29.0 numpy==1.22.4
RUN pip install --no-cache-dir madmom>=0.16.1
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.9-slim as runtime

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
COPY config/ config/
COPY services/ services/
COPY scipy_patch.py .
# Copy models directory (large files excluded via .dockerignore)
COPY models/ models/
# Note: Large Beat-Transformer model files excluded via .dockerignore to reduce container size

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1001 app \
    && chown -R app:app /app
USER app

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