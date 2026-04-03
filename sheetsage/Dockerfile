FROM ubuntu:18.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8082 \
    SHEETSAGE_PRELOAD=false \
    SHEETSAGE_CACHE_DIR=/app/cache

SHELL ["/bin/bash", "-c"]

RUN apt-get update --fix-missing && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    fluidsynth \
    git \
    python3 \
    python3-dev \
    python3-pip \
    software-properties-common \
    wget \
    && ln -sf $(which python3) /usr/local/bin/python \
    && python -m pip install --no-cache-dir --upgrade "pip<20.3" setuptools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/build
RUN wget https://www.link.cs.cmu.edu/music-analysis/melisma2003.tar.gz \
    && [ "b4db2ab616dd2a14c8baff64787d3d0f257df6b0159452fb52fc3e29411743ad  melisma2003.tar.gz" = "$(sha256sum melisma2003.tar.gz)" ] \
    && tar xvfz melisma2003.tar.gz \
    && cd melisma2003/key \
    && make \
    && mv key /usr/local/bin/melisma-key \
    && cd / \
    && rm -rf /tmp/build

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir Cython==0.29.24 numpy==1.19.5 numba==0.48.0 resampy==0.2.2 \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app.py ./app.py
COPY service.py ./service.py
COPY cache ./cache
COPY src/sheetsage_upstream/sheetsage ./src/sheetsage_upstream/sheetsage

RUN mkdir -p /app/cache

EXPOSE 8082

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8082} --workers 1 --threads 4 --timeout 900 app:app"]
