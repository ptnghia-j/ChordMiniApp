# Use Python 3.9 slim image for smaller size
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies including build tools for ML libraries
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
# Install build dependencies first for madmom compilation
RUN pip install --no-cache-dir Cython>=0.29.0 numpy==1.22.4
RUN pip install --no-cache-dir madmom>=0.16.1
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and essential files
COPY app.py .
COPY config/ config/
COPY services/ services/
COPY scipy_patch.py .
# Copy models directory (large files excluded via .dockerignore)
COPY models/ models/
# Note: Large Beat-Transformer model files excluded via .dockerignore to reduce container size

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Expose port
EXPOSE 8080

# Run the application with longer timeout for ML processing
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "600", "app:app"]
