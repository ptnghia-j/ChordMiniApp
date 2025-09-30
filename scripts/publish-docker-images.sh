#!/bin/bash

# ChordMiniApp Docker Image Publishing Script
# This script tags and pushes Docker images to Docker Hub
#
# Usage:
#   ./scripts/publish-docker-images.sh [version]
#
# Example:
#   ./scripts/publish-docker-images.sh v0.4.5
#   ./scripts/publish-docker-images.sh  # Uses version from package.json

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="ptnghia"
FRONTEND_IMAGE="chordminiapp:test"
BACKEND_IMAGE="chordminiapp-backend:test"
FRONTEND_REPO="${DOCKER_USERNAME}/chordminiapp-frontend"
BACKEND_REPO="${DOCKER_USERNAME}/chordminiapp-backend"

# Get version from argument or package.json
if [ -n "$1" ]; then
    VERSION="$1"
else
    # Extract version from package.json
    if command -v node &> /dev/null; then
        VERSION="v$(node -p "require('./package.json').version")"
    else
        echo -e "${RED}❌ Error: Node.js not found and no version specified${NC}"
        echo "Usage: $0 [version]"
        exit 1
    fi
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         ChordMiniApp Docker Image Publisher               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Version:${NC} ${VERSION}"
echo -e "${YELLOW}Docker Hub Username:${NC} ${DOCKER_USERNAME}"
echo ""

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if images exist
echo -e "${BLUE}🔍 Checking local images...${NC}"
if ! docker image inspect "${FRONTEND_IMAGE}" &> /dev/null; then
    echo -e "${RED}❌ Error: Frontend image '${FRONTEND_IMAGE}' not found${NC}"
    echo "Please build the frontend image first:"
    echo "  docker build -t ${FRONTEND_IMAGE} -f Dockerfile ."
    exit 1
fi

if ! docker image inspect "${BACKEND_IMAGE}" &> /dev/null; then
    echo -e "${RED}❌ Error: Backend image '${BACKEND_IMAGE}' not found${NC}"
    echo "Please build the backend image first:"
    echo "  cd python_backend && docker build -t ${BACKEND_IMAGE} -f Dockerfile ."
    exit 1
fi

echo -e "${GREEN}✅ Local images found${NC}"
echo ""

# Check Docker Hub login
echo -e "${BLUE}🔐 Checking Docker Hub authentication...${NC}"
if ! docker info 2>&1 | grep -q "Username: ${DOCKER_USERNAME}"; then
    echo -e "${YELLOW}⚠️  Not logged in to Docker Hub${NC}"
    echo "Please login to Docker Hub:"
    echo "  docker login --username ${DOCKER_USERNAME}"
    echo ""
    read -p "Press Enter after logging in, or Ctrl+C to cancel..."
fi

echo -e "${GREEN}✅ Docker Hub authentication verified${NC}"
echo ""

# Confirm before proceeding
echo -e "${YELLOW}📦 Images to be published:${NC}"
echo "  Frontend: ${FRONTEND_REPO}:latest"
echo "  Frontend: ${FRONTEND_REPO}:${VERSION}"
echo "  Backend:  ${BACKEND_REPO}:latest"
echo "  Backend:  ${BACKEND_REPO}:${VERSION}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ Cancelled${NC}"
    exit 0
fi

# Tag and push frontend image
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Frontend Image                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}🏷️  Tagging frontend image...${NC}"
docker tag "${FRONTEND_IMAGE}" "${FRONTEND_REPO}:latest"
docker tag "${FRONTEND_IMAGE}" "${FRONTEND_REPO}:${VERSION}"
echo -e "${GREEN}✅ Frontend image tagged${NC}"

echo -e "${BLUE}📤 Pushing frontend image (latest)...${NC}"
docker push "${FRONTEND_REPO}:latest"
echo -e "${GREEN}✅ Frontend image pushed (latest)${NC}"

echo -e "${BLUE}📤 Pushing frontend image (${VERSION})...${NC}"
docker push "${FRONTEND_REPO}:${VERSION}"
echo -e "${GREEN}✅ Frontend image pushed (${VERSION})${NC}"

# Tag and push backend image
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   Backend Image                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}🏷️  Tagging backend image...${NC}"
docker tag "${BACKEND_IMAGE}" "${BACKEND_REPO}:latest"
docker tag "${BACKEND_IMAGE}" "${BACKEND_REPO}:${VERSION}"
echo -e "${GREEN}✅ Backend image tagged${NC}"

echo -e "${BLUE}📤 Pushing backend image (latest)...${NC}"
docker push "${BACKEND_REPO}:latest"
echo -e "${GREEN}✅ Backend image pushed (latest)${NC}"

echo -e "${BLUE}📤 Pushing backend image (${VERSION})...${NC}"
docker push "${BACKEND_REPO}:${VERSION}"
echo -e "${GREEN}✅ Backend image pushed (${VERSION})${NC}"

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    🎉 Success!                             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ All images published successfully!${NC}"
echo ""
echo -e "${YELLOW}📦 Published Images:${NC}"
echo "  Frontend: https://hub.docker.com/r/${FRONTEND_REPO}"
echo "  Backend:  https://hub.docker.com/r/${BACKEND_REPO}"
echo ""
echo -e "${YELLOW}🚀 Users can now deploy with:${NC}"
echo "  docker pull ${FRONTEND_REPO}:${VERSION}"
echo "  docker pull ${BACKEND_REPO}:${VERSION}"
echo ""
echo -e "${YELLOW}📝 Or use docker-compose:${NC}"
echo "  docker-compose -f docker-compose.prod.yml --env-file .env.docker up -d"
echo ""

