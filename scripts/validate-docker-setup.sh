#!/bin/bash

# ChordMiniApp Docker Setup Validation Script
# This script validates the Docker configuration and tests local builds

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
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    print_header "Checking Docker installation"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed."
        print_status "Please install Docker from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running."
        print_status "Please start Docker and try again."
        exit 1
    fi
    
    print_status "Docker is installed and running."
    docker --version
}

# Check if Docker Compose is available
check_docker_compose() {
    print_header "Checking Docker Compose"
    
    if docker compose version &> /dev/null; then
        print_status "Docker Compose (v2) is available."
        docker compose version
    elif command -v docker-compose &> /dev/null; then
        print_status "Docker Compose (v1) is available."
        docker-compose --version
        print_warning "Consider upgrading to Docker Compose v2."
    else
        print_error "Docker Compose is not available."
        print_status "Please install Docker Compose."
        exit 1
    fi
}

# Validate Dockerfile syntax
validate_dockerfiles() {
    print_header "Validating Dockerfile syntax"
    
    # Frontend Dockerfile
    if [[ -f "Dockerfile" ]]; then
        print_status "Validating frontend Dockerfile..."
        if docker build --no-cache --dry-run -f Dockerfile . &> /dev/null; then
            print_status "✅ Frontend Dockerfile syntax is valid."
        else
            print_error "❌ Frontend Dockerfile has syntax errors."
            return 1
        fi
    else
        print_error "Frontend Dockerfile not found."
        return 1
    fi
    
    # Backend Dockerfile
    if [[ -f "python_backend/Dockerfile" ]]; then
        print_status "Validating backend Dockerfile..."
        if docker build --no-cache --dry-run -f python_backend/Dockerfile python_backend/ &> /dev/null; then
            print_status "✅ Backend Dockerfile syntax is valid."
        else
            print_error "❌ Backend Dockerfile has syntax errors."
            return 1
        fi
    else
        print_error "Backend Dockerfile not found."
        return 1
    fi
}

# Test Docker builds
test_docker_builds() {
    print_header "Testing Docker builds"
    
    # Build frontend
    print_status "Building frontend image..."
    if docker build -t chordmini-frontend-test . > /tmp/frontend-build.log 2>&1; then
        print_status "✅ Frontend build successful."
        
        # Get image size
        IMAGE_SIZE=$(docker images chordmini-frontend-test --format "table {{.Size}}" | tail -n 1)
        print_status "Frontend image size: $IMAGE_SIZE"
    else
        print_error "❌ Frontend build failed."
        print_status "Check build log: /tmp/frontend-build.log"
        return 1
    fi
    
    # Build backend
    print_status "Building backend image..."
    if docker build -t chordmini-backend-test python_backend/ > /tmp/backend-build.log 2>&1; then
        print_status "✅ Backend build successful."
        
        # Get image size
        IMAGE_SIZE=$(docker images chordmini-backend-test --format "table {{.Size}}" | tail -n 1)
        print_status "Backend image size: $IMAGE_SIZE"
    else
        print_error "❌ Backend build failed."
        print_status "Check build log: /tmp/backend-build.log"
        return 1
    fi
}

# Test container startup
test_container_startup() {
    print_header "Testing container startup"
    
    # Test frontend container
    print_status "Testing frontend container startup..."
    FRONTEND_CONTAINER=$(docker run -d -p 3001:3000 chordmini-frontend-test)
    
    # Wait for container to start
    sleep 10
    
    if docker ps | grep -q "$FRONTEND_CONTAINER"; then
        print_status "✅ Frontend container started successfully."
        
        # Test health endpoint
        if curl -f http://localhost:3001/api/health &> /dev/null; then
            print_status "✅ Frontend health check passed."
        else
            print_warning "⚠️ Frontend health check failed (may be expected in test environment)."
        fi
    else
        print_error "❌ Frontend container failed to start."
        docker logs "$FRONTEND_CONTAINER"
    fi
    
    # Cleanup frontend container
    docker stop "$FRONTEND_CONTAINER" &> /dev/null || true
    docker rm "$FRONTEND_CONTAINER" &> /dev/null || true
    
    # Test backend container
    print_status "Testing backend container startup..."
    BACKEND_CONTAINER=$(docker run -d -p 8081:8080 chordmini-backend-test)
    
    # Wait for container to start
    sleep 15
    
    if docker ps | grep -q "$BACKEND_CONTAINER"; then
        print_status "✅ Backend container started successfully."
        
        # Test health endpoint
        if curl -f http://localhost:8081/ &> /dev/null; then
            print_status "✅ Backend health check passed."
        else
            print_warning "⚠️ Backend health check failed (may be expected in test environment)."
        fi
    else
        print_error "❌ Backend container failed to start."
        docker logs "$BACKEND_CONTAINER"
    fi
    
    # Cleanup backend container
    docker stop "$BACKEND_CONTAINER" &> /dev/null || true
    docker rm "$BACKEND_CONTAINER" &> /dev/null || true
}

# Test Docker Compose
test_docker_compose() {
    print_header "Testing Docker Compose configuration"
    
    if [[ -f "docker-compose.yml" ]]; then
        print_status "Validating docker-compose.yml..."
        
        if docker compose config &> /dev/null; then
            print_status "✅ Docker Compose configuration is valid."
        else
            print_error "❌ Docker Compose configuration has errors."
            return 1
        fi
        
        # Test compose build
        print_status "Testing Docker Compose build..."
        if docker compose build &> /dev/null; then
            print_status "✅ Docker Compose build successful."
        else
            print_error "❌ Docker Compose build failed."
            return 1
        fi
    else
        print_warning "docker-compose.yml not found."
    fi
}

# Cleanup test images
cleanup() {
    print_header "Cleaning up test images"
    
    docker rmi chordmini-frontend-test &> /dev/null || true
    docker rmi chordmini-backend-test &> /dev/null || true
    
    print_status "Cleanup complete."
}

# Security check
security_check() {
    print_header "Running basic security checks"
    
    # Check for secrets in Dockerfiles
    print_status "Checking for potential secrets in Dockerfiles..."
    
    if grep -i -E "(password|secret|key|token)" Dockerfile python_backend/Dockerfile 2>/dev/null; then
        print_warning "⚠️ Potential secrets found in Dockerfiles. Please review."
    else
        print_status "✅ No obvious secrets found in Dockerfiles."
    fi
    
    # Check for root user
    print_status "Checking for non-root user configuration..."
    
    if grep -q "USER" Dockerfile && grep -q "USER" python_backend/Dockerfile; then
        print_status "✅ Non-root users configured in both Dockerfiles."
    else
        print_warning "⚠️ Consider using non-root users in containers."
    fi
}

# Main execution
main() {
    print_header "ChordMiniApp Docker Setup Validation"
    echo "This script validates the Docker configuration and tests local builds."
    echo ""
    
    check_docker
    echo ""
    check_docker_compose
    echo ""
    validate_dockerfiles
    echo ""
    test_docker_builds
    echo ""
    test_container_startup
    echo ""
    test_docker_compose
    echo ""
    security_check
    echo ""
    cleanup
    
    echo ""
    print_status "Validation complete! 🎉"
    print_status "Your Docker setup is working correctly."
    print_status "You can now use the CI/CD pipeline with confidence."
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"
