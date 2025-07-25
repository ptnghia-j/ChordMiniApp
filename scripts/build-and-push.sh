#!/bin/bash

# ChordMiniApp Docker Build and Push Script (MANUAL USE ONLY)
# This script builds Docker images locally and pushes them to a container registry
#
# ⚠️  NOTE: Docker automation has been removed from CI/CD pipeline
# This script is now for MANUAL deployment only

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

# Configuration
REGISTRY_TYPE=""
REGISTRY_URL=""
USERNAME=""
PROJECT_ID=""
VERSION_TAG="latest"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY_TYPE="$2"
            shift 2
            ;;
        --username)
            USERNAME="$2"
            shift 2
            ;;
        --project-id)
            PROJECT_ID="$2"
            shift 2
            ;;
        --version)
            VERSION_TAG="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --registry TYPE     Registry type: dockerhub, ghcr, gcr"
            echo "  --username USER     Username for Docker Hub or GitHub"
            echo "  --project-id ID     Project ID for GCR"
            echo "  --version TAG       Version tag (default: latest)"
            echo "  --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --registry dockerhub --username myuser"
            echo "  $0 --registry ghcr --username myuser"
            echo "  $0 --registry gcr --project-id my-project"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Interactive setup if no arguments provided
if [[ -z "$REGISTRY_TYPE" ]]; then
    print_header "ChordMiniApp Docker Build and Push"
    echo "Choose your container registry:"
    echo "1) Docker Hub (public)"
    echo "2) GitHub Container Registry (GHCR)"
    echo "3) Google Container Registry (GCR)"
    echo "4) Local build only (no push)"
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1)
            REGISTRY_TYPE="dockerhub"
            read -p "Enter your Docker Hub username: " USERNAME
            ;;
        2)
            REGISTRY_TYPE="ghcr"
            read -p "Enter your GitHub username: " USERNAME
            ;;
        3)
            REGISTRY_TYPE="gcr"
            read -p "Enter your GCP Project ID: " PROJECT_ID
            ;;
        4)
            REGISTRY_TYPE="local"
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
fi

# Set registry URLs and image names
case $REGISTRY_TYPE in
    dockerhub)
        if [[ -z "$USERNAME" ]]; then
            print_error "Username required for Docker Hub"
            exit 1
        fi
        FRONTEND_IMAGE="$USERNAME/chordmini-frontend:$VERSION_TAG"
        BACKEND_IMAGE="$USERNAME/chordmini-backend:$VERSION_TAG"
        REGISTRY_URL="docker.io"
        ;;
    ghcr)
        if [[ -z "$USERNAME" ]]; then
            print_error "Username required for GHCR"
            exit 1
        fi
        FRONTEND_IMAGE="ghcr.io/$USERNAME/chordminiapp/frontend:$VERSION_TAG"
        BACKEND_IMAGE="ghcr.io/$USERNAME/chordminiapp/backend:$VERSION_TAG"
        REGISTRY_URL="ghcr.io"
        ;;
    gcr)
        if [[ -z "$PROJECT_ID" ]]; then
            print_error "Project ID required for GCR"
            exit 1
        fi
        FRONTEND_IMAGE="gcr.io/$PROJECT_ID/chordmini-frontend:$VERSION_TAG"
        BACKEND_IMAGE="gcr.io/$PROJECT_ID/chordmini-backend:$VERSION_TAG"
        REGISTRY_URL="gcr.io"
        ;;
    local)
        FRONTEND_IMAGE="chordmini-frontend:$VERSION_TAG"
        BACKEND_IMAGE="chordmini-backend:$VERSION_TAG"
        ;;
    *)
        print_error "Invalid registry type: $REGISTRY_TYPE"
        exit 1
        ;;
esac

# Check if Docker is running
check_docker() {
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_status "Docker is running."
}

# Build images
build_images() {
    print_header "Building Docker images"
    
    # Build frontend
    print_status "Building frontend image..."
    if docker build -t "$FRONTEND_IMAGE" . > /tmp/frontend-build.log 2>&1; then
        print_status "✅ Frontend image built successfully: $FRONTEND_IMAGE"
    else
        print_error "❌ Frontend build failed. Check log: /tmp/frontend-build.log"
        exit 1
    fi
    
    # Build backend
    print_status "Building backend image..."
    if docker build -t "$BACKEND_IMAGE" ./python_backend > /tmp/backend-build.log 2>&1; then
        print_status "✅ Backend image built successfully: $BACKEND_IMAGE"
    else
        print_error "❌ Backend build failed. Check log: /tmp/backend-build.log"
        exit 1
    fi
    
    # Show image sizes
    print_status "Image sizes:"
    docker images | grep -E "(chordmini|$USERNAME)" | head -10
}

# Login to registry
login_registry() {
    if [[ "$REGISTRY_TYPE" == "local" ]]; then
        return 0
    fi
    
    print_header "Logging in to $REGISTRY_TYPE"
    
    case $REGISTRY_TYPE in
        dockerhub)
            print_status "Logging in to Docker Hub..."
            docker login
            ;;
        ghcr)
            print_status "Logging in to GitHub Container Registry..."
            if [[ -z "$GITHUB_TOKEN" ]]; then
                print_warning "GITHUB_TOKEN not set. You'll need to enter your token."
                read -s -p "Enter GitHub Personal Access Token: " token
                echo
                echo "$token" | docker login ghcr.io -u "$USERNAME" --password-stdin
            else
                echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$USERNAME" --password-stdin
            fi
            ;;
        gcr)
            print_status "Configuring Docker for Google Container Registry..."
            gcloud auth configure-docker
            ;;
    esac
}

# Push images
push_images() {
    if [[ "$REGISTRY_TYPE" == "local" ]]; then
        print_status "Local build complete. Images are ready for use."
        return 0
    fi
    
    print_header "Pushing images to $REGISTRY_TYPE"
    
    # Push frontend
    print_status "Pushing frontend image..."
    if docker push "$FRONTEND_IMAGE"; then
        print_status "✅ Frontend image pushed successfully"
    else
        print_error "❌ Failed to push frontend image"
        exit 1
    fi
    
    # Push backend
    print_status "Pushing backend image..."
    if docker push "$BACKEND_IMAGE"; then
        print_status "✅ Backend image pushed successfully"
    else
        print_error "❌ Failed to push backend image"
        exit 1
    fi
}

# Test images
test_images() {
    print_header "Testing built images"
    
    # Test if images can be run
    print_status "Testing frontend image startup..."
    FRONTEND_CONTAINER=$(docker run -d -p 3001:3000 "$FRONTEND_IMAGE")
    sleep 5
    
    if docker ps | grep -q "$FRONTEND_CONTAINER"; then
        print_status "✅ Frontend container started successfully"
        docker stop "$FRONTEND_CONTAINER" &> /dev/null
        docker rm "$FRONTEND_CONTAINER" &> /dev/null
    else
        print_warning "⚠️ Frontend container failed to start (may be expected without backend)"
        docker rm "$FRONTEND_CONTAINER" &> /dev/null || true
    fi
    
    print_status "Testing backend image startup..."
    BACKEND_CONTAINER=$(docker run -d -p 8081:8080 "$BACKEND_IMAGE")
    sleep 10
    
    if docker ps | grep -q "$BACKEND_CONTAINER"; then
        print_status "✅ Backend container started successfully"
        docker stop "$BACKEND_CONTAINER" &> /dev/null
        docker rm "$BACKEND_CONTAINER" &> /dev/null
    else
        print_warning "⚠️ Backend container failed to start"
        docker logs "$BACKEND_CONTAINER" | tail -10
        docker rm "$BACKEND_CONTAINER" &> /dev/null || true
    fi
}

# Main execution
main() {
    print_header "ChordMiniApp Docker Build and Push"
    echo "Registry: $REGISTRY_TYPE"
    echo "Frontend Image: $FRONTEND_IMAGE"
    echo "Backend Image: $BACKEND_IMAGE"
    echo ""
    
    check_docker
    build_images
    test_images
    
    if [[ "$REGISTRY_TYPE" != "local" ]]; then
        login_registry
        push_images
        
        echo ""
        print_status "🎉 Build and push completed successfully!"
        print_status "Your images are now available at:"
        echo "  Frontend: $FRONTEND_IMAGE"
        echo "  Backend: $BACKEND_IMAGE"
        echo ""
        print_status "Other users can now run your images with:"
        echo "  docker run -p 3000:3000 $FRONTEND_IMAGE"
        echo "  docker run -p 8080:8080 $BACKEND_IMAGE"
    else
        echo ""
        print_status "🎉 Local build completed successfully!"
        print_status "Your images are ready for local use:"
        echo "  Frontend: $FRONTEND_IMAGE"
        echo "  Backend: $BACKEND_IMAGE"
    fi
}

# Run main function
main "$@"
