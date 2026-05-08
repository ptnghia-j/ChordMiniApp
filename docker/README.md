# Docker Setup

This guide is for running ChordMini with Docker Desktop or Docker Compose.

## What You Need

1. Docker Desktop installed and open.
2. A copy of this repository on your computer.
3. Firebase web app values for the basic app setup.

> [!NOTE]
> Docker Desktop must be running before the commands below will work. If Docker is closed, commands such as `docker compose up` may fail with a message about not being able to connect to the Docker daemon.

## Files Used Here

- `../docker-compose.prod.yml` - current published Docker Hub images, useful when you download only the production compose file.
- `docker-compose.yml` - current published Docker Hub images, used from this repository.
- `docker-compose.dev.yml` - builds the frontend and backend images locally from this repository.
- `../Dockerfile` - frontend image build.
- `../python_backend/Dockerfile` - backend image build.
- `../.env.docker.example` - template for Docker environment variables.

## Step 1: Make Your Docker Env File

From the repository root:

```bash
cp .env.docker.example .env.docker
```

Open `.env.docker` and fill in the Firebase values:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Optional keys can stay blank until you need those features:

```bash
NEXT_PUBLIC_YOUTUBE_API_KEY=
MUSIC_AI_API_KEY=
GEMINI_API_KEY=
GENIUS_API_KEY=
```

> [!NOTE]
> Lines that start with `NEXT_PUBLIC_` are safe to send to the browser. Keys without `NEXT_PUBLIC_`, such as `GEMINI_API_KEY`, are server-only and should not be shared publicly.

## Step 2: Choose How To Start

### Option A: Pull Published Images

This is the shortest path. It pulls the current `ptnghia/chordminiapp-frontend:latest` and `ptnghia/chordminiapp-backend:latest` images from Docker Hub.

```bash
docker compose -f docker/docker-compose.yml --env-file .env.docker pull
docker compose -f docker/docker-compose.yml --env-file .env.docker up
```

Open [http://localhost:3000](http://localhost:3000).

To stop the app, press `Ctrl+C`. Then run:

```bash
docker compose -f docker/docker-compose.yml --env-file .env.docker down
```

> [!NOTE]
> The published images are built for `linux/amd64`. The compose file includes that platform setting so Docker Desktop can run them on Apple Silicon with emulation. If your computer feels slow with the published images, use Option B to build native local images instead.

### Option B: Build Locally

Use this option on Intel Macs, Windows PCs, Linux PCs, or whenever pulling the published images fails.

```bash
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker build
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker up
```

Open [http://localhost:3000](http://localhost:3000).

To stop the app, press `Ctrl+C`. Then run:

```bash
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker down
```

> [!NOTE]
> The first local build can take a while because the backend installs Python audio libraries and downloads model files.

## Docker Desktop GUI Steps

If you prefer to click through Docker Desktop:

1. Open Docker Desktop and wait until it says the engine is running.
2. Open the repository folder in Terminal, PowerShell, or the Docker Desktop terminal.
3. Create `.env.docker` using Step 1 above.
4. Run either Option A or Option B above.
5. In Docker Desktop, open **Containers** to see `chordmini-frontend`, `chordmini-backend`, and, for local builds, `chordmini-redis`.
6. Use the stop/start buttons in Docker Desktop after the containers have been created.

> [!NOTE]
> Avoid running the frontend and backend images one by one from the **Images** tab. Docker Compose starts them on the same network and passes the app settings from `.env.docker`, which is the part that makes the services find each other.

## Quick Checks

Frontend:

```bash
curl http://localhost:3000/api/health
```

Backend:

```bash
curl http://localhost:8080/health
```

Both should return a small healthy response.

## Common Problems

### Docker Cannot Connect To The Daemon

Open Docker Desktop first, wait until it finishes starting, and run the command again.

### Port Already In Use

The app uses these ports:

- `3000` for the web app
- `8080` for the Python backend
- `6379` for Redis in the local-build setup

Stop the other program using the port, or change the left side of the port mapping in the compose file. For example, `3001:3000` makes the app available at `http://localhost:3001`.

### Published Image Does Not Match Your Computer

Use the local-build setup:

```bash
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker build
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker up
```

### Reset Everything Docker Created For This App

For the published-image setup:

```bash
docker compose -f docker/docker-compose.yml --env-file .env.docker down --volumes
```

For the local-build setup:

```bash
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker down --volumes
```
