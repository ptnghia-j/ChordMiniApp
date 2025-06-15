# Optimized Full-Featured Backend Deployment
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies including TBB for numba
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    python3-dev \
    libffi-dev \
    libsndfile1 \
    libsndfile1-dev \
    pkg-config \
    ffmpeg \
    libasound2-dev \
    libportaudio2 \
    libportaudiocpp0 \
    portaudio19-dev \
    wget \
    curl \
    git \
    libtbb-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies using modern stack approach for Python 3.9
# Old setuptools + wheels so numpy.distutils still works if needed
RUN pip install --no-cache-dir --upgrade "setuptools<65" wheel

# Step 1: Install modern stack that DOES have wheels for Python 3.9
RUN pip install --no-cache-dir \
    "numba==0.59.*" \
    "librosa==0.10.*" \
    "llvmlite>=0.42.0"

# Step 2: Install Cython and NumPy for madmom
RUN pip install --no-cache-dir \
    "Cython<3.0" \
    "numpy>=1.21.0,<1.25.0"

# Step 3: Install PyTorch CPU version
RUN pip install --no-cache-dir torch==1.13.1 --index-url https://download.pytorch.org/whl/cpu

# Step 4: Install TensorFlow GPU and related packages
RUN pip install --no-cache-dir \
    tensorflow==2.13.1 \
    tensorflow-estimator==2.13.0 \
    keras==2.13.1

# Step 5: Install scientific computing stack
RUN pip install --no-cache-dir \
    "scipy>=1.9.0" \
    "pandas>=1.5.0" \
    "scikit-learn>=1.1.0"

# Step 6: Install audio processing libraries
RUN pip install --no-cache-dir \
    soundfile==0.12.1 \
    audioread==3.0.1 \
    resampy==0.4.3 \
    soxr==0.5.0.post1

# Step 7: Install spleeter with --no-deps to skip its pinned dependencies
RUN pip install --no-cache-dir --no-deps \
    spleeter==2.3.2 \
    click==7.1.2 \
    typer==0.3.2 \
    norbert==0.2.1

# Step 8: Install madmom for beat detection
RUN pip install --no-cache-dir madmom==0.16.1

# Step 9: Install Flask and web dependencies
RUN pip install --no-cache-dir \
    Flask==2.0.3 \
    Flask-Cors==3.0.10 \
    Flask-Limiter==3.5.0 \
    Werkzeug==2.0.3 \
    gunicorn==21.2.0

# Step 10: Install chord recognition dependencies
RUN pip install --no-cache-dir \
    pretty_midi>=0.2.9 \
    h5py>=2.9.0 \
    matplotlib>=2.2.4 \
    mir_eval>=0.5 \
    pydub>=0.23.1 \
    joblib>=0.13.2 \
    mido>=1.2.0 \
    pyfluidsynth>=1.3.0

# Step 11: Install remaining dependencies
RUN pip install --no-cache-dir \
    ffmpeg-python==0.2.0 \
    python-dotenv==1.1.0 \
    requests==2.32.3 \
    "httpx[http2]>=0.24.0" \
    h2>=4.0.0 \
    scipy>=1.9.0 \
    lyricsgenius>=3.0.1 \
    Pillow==10.0.0

# Step 12: Install BTC model dependencies
RUN pip install --no-cache-dir \
    PyYAML>=6.0 \
    tqdm>=4.64.0

# Copy application code
COPY *.py ./

# Copy models directory (this is the largest component)
COPY models/ ./models/

# Copy public directory
RUN mkdir -p ./public
COPY public/ ./public/

# Create necessary directories
RUN mkdir -p /app/temp /app/cache \
    && chown -R app:app /app

# Switch to non-root user
USER app

# Set environment variables
ENV FLASK_ENV=production
ENV PORT=8080
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

# Run the application
CMD ["python", "app.py"]
