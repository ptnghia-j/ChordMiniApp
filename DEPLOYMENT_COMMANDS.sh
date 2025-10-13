#!/bin/bash
# ChordMiniApp Deployment Commands - Quick Reference
# Spleeter 2.3.2 Integration

# ============================================================================
# DEPLOYMENT COMMANDS
# ============================================================================

# 1. START THE FULL STACK
echo "🚀 Starting ChordMiniApp full-stack deployment..."
docker compose -f docker/docker-compose.yml --env-file .env.docker up -d
sleep 15
docker compose -f docker/docker-compose.yml ps

# 2. STOP THE FULL STACK
# docker compose -f docker/docker-compose.yml down

# 3. RESTART THE FULL STACK
# docker compose -f docker/docker-compose.yml restart

# 4. STOP AND CLEAN UP (removes volumes)
# docker compose -f docker/docker-compose.yml down -v

# ============================================================================
# VERIFICATION COMMANDS
# ============================================================================

# Check service status
# docker compose -f docker/docker-compose.yml ps

# Test frontend (browser)
# open http://localhost:3000

# Test frontend (curl)
# curl -I http://localhost:3000

# Test backend health
# curl http://localhost:8080/

# ============================================================================
# LOGGING COMMANDS
# ============================================================================

# View all logs (follow mode)
# docker compose -f docker/docker-compose.yml logs -f

# View backend logs
# docker logs chordmini-backend --tail=100

# View frontend logs
# docker logs chordmini-frontend --tail=100

# Follow backend logs in real-time
# docker logs -f chordmini-backend

# Filter for Spleeter messages
# docker logs chordmini-backend 2>&1 | grep -i "spleeter\|separation\|stems"

# ============================================================================
# TESTING COMMANDS
# ============================================================================

# Test beat detection with Spleeter (replace test_audio.mp3 with your file)
# curl -X POST http://localhost:8080/api/detect-beats \
#   -F "file=@test_audio.mp3" \
#   -F "detector=beat-transformer" \
#   | jq '.'

# Download test audio from YouTube (requires yt-dlp)
# yt-dlp -x --audio-format mp3 --audio-quality 0 \
#   --postprocessor-args "-ss 0 -t 30" \
#   -o "test_audio_30s.mp3" \
#   "https://www.youtube.com/watch?v=vO8TOh4Lkkc"

# ============================================================================
# MONITORING COMMANDS
# ============================================================================

# View resource usage
# docker stats

# View resource usage for backend only
# docker stats chordmini-backend

# Check network
# docker network inspect chordmini-network

# ============================================================================
# TROUBLESHOOTING COMMANDS
# ============================================================================

# Kill process on port 3000
# lsof -ti:3000 | xargs kill -9

# Kill process on port 8080
# lsof -ti:8080 | xargs kill -9

# Verify Docker is running
# docker ps

# Rebuild backend image
# docker build -t chordminiapp-backend:spleeter -f python_backend/Dockerfile python_backend

# Rebuild frontend image
# docker build -t chordminiapp:test -f Dockerfile .

# Inspect backend container
# docker exec -it chordmini-backend bash

# Inspect frontend container
# docker exec -it chordmini-frontend sh

# Check Spleeter models in container
# docker exec chordmini-backend ls -la /home/app/.cache/spleeter/5stems/

# Test backend from frontend container
# docker exec chordmini-frontend curl http://chordmini-backend:8080/

# ============================================================================
# INDIVIDUAL SERVICE COMMANDS
# ============================================================================

# Start backend only
# docker compose -f docker/docker-compose.yml up -d backend

# Start frontend only
# docker compose -f docker/docker-compose.yml up -d frontend

# Stop backend only
# docker stop chordmini-backend

# Stop frontend only
# docker stop chordmini-frontend

# Restart backend only
# docker compose -f docker/docker-compose.yml restart backend

# Restart frontend only
# docker compose -f docker/docker-compose.yml restart frontend

# ============================================================================
# CLEANUP COMMANDS
# ============================================================================

# Remove stopped containers
# docker container prune -f

# Remove unused images
# docker image prune -f

# Remove unused volumes
# docker volume prune -f

# Remove everything (use with caution!)
# docker system prune -af --volumes

# ============================================================================
# PRODUCTION DEPLOYMENT (Google Cloud Run)
# ============================================================================

# Tag images for Google Container Registry
# docker tag chordminiapp-backend:spleeter gcr.io/YOUR_PROJECT_ID/chordminiapp-backend:spleeter
# docker tag chordminiapp:test gcr.io/YOUR_PROJECT_ID/chordminiapp-frontend:latest

# Push to Google Container Registry
# docker push gcr.io/YOUR_PROJECT_ID/chordminiapp-backend:spleeter
# docker push gcr.io/YOUR_PROJECT_ID/chordminiapp-frontend:latest

# Deploy backend to Cloud Run
# gcloud run deploy chordminiapp-backend \
#   --image gcr.io/YOUR_PROJECT_ID/chordminiapp-backend:spleeter \
#   --platform managed \
#   --region us-central1 \
#   --memory 4Gi \
#   --cpu 2 \
#   --timeout 300 \
#   --max-instances 10 \
#   --allow-unauthenticated

# Deploy frontend to Cloud Run
# gcloud run deploy chordminiapp-frontend \
#   --image gcr.io/YOUR_PROJECT_ID/chordminiapp-frontend:latest \
#   --platform managed \
#   --region us-central1 \
#   --memory 512Mi \
#   --cpu 1 \
#   --timeout 60 \
#   --max-instances 10 \
#   --allow-unauthenticated

# ============================================================================
# DOCKER HUB DEPLOYMENT
# ============================================================================

# Tag images for Docker Hub
# docker tag chordminiapp-backend:spleeter ptnghia/chordminiapp-backend:spleeter
# docker tag chordminiapp:test ptnghia/chordminiapp-frontend:latest

# Push to Docker Hub
# docker push ptnghia/chordminiapp-backend:spleeter
# docker push ptnghia/chordminiapp-frontend:latest

# ============================================================================
# NOTES
# ============================================================================

# - Ensure Docker Desktop is running before executing commands
# - Wait 15-20 seconds after starting services for health checks to pass
# - Backend requires 2-4GB memory for Spleeter + TensorFlow
# - Processing time: ~7 seconds for 30 seconds of audio
# - Spleeter models are pre-downloaded in the Docker image (~197MB)
# - Backend runs as non-root user (app, UID 1001)
# - CORS is configured for localhost and Vercel domains

# ============================================================================
# QUICK START (Copy-Paste Ready)
# ============================================================================

# Start everything:
# docker compose -f docker/docker-compose.yml --env-file .env.docker up -d && sleep 15 && docker compose -f docker/docker-compose.yml ps

# View logs:
# docker compose -f docker/docker-compose.yml logs -f

# Stop everything:
# docker compose -f docker/docker-compose.yml down

# Test beat detection:
# curl -X POST http://localhost:8080/api/detect-beats -F "file=@test_audio.mp3" -F "detector=beat-transformer" | jq '.'

