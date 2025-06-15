#!/bin/bash

# Video Conversion Script for ChordMini Demo Videos
# Converts MOV files to MP4 and WebM for better browser compatibility

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}ChordMini Video Conversion Script${NC}"
echo "Converting demo videos to web-compatible formats..."
echo

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}Error: ffmpeg is not installed.${NC}"
    echo "Please install ffmpeg first:"
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    echo "  Windows: Download from https://ffmpeg.org/download.html"
    exit 1
fi

# Create public directory if it doesn't exist
mkdir -p public

# Function to convert video
convert_video() {
    local input_file="$1"
    local output_name="$2"
    
    if [ ! -f "$input_file" ]; then
        echo -e "${YELLOW}Warning: $input_file not found, skipping...${NC}"
        return
    fi
    
    echo -e "${GREEN}Converting $input_file...${NC}"
    
    # Convert to MP4 (H.264) - best compatibility
    echo "  → Creating MP4 version..."
    ffmpeg -i "$input_file" \
        -c:v libx264 \
        -preset medium \
        -crf 23 \
        -c:a aac \
        -b:a 128k \
        -movflags +faststart \
        -y "public/${output_name}.mp4" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "    ${GREEN}✓ MP4 created successfully${NC}"
    else
        echo -e "    ${RED}✗ MP4 conversion failed${NC}"
    fi
    
    # Convert to WebM (VP9) - better compression
    echo "  → Creating WebM version..."
    ffmpeg -i "$input_file" \
        -c:v libvpx-vp9 \
        -crf 30 \
        -b:v 0 \
        -c:a libopus \
        -b:a 128k \
        -y "public/${output_name}.webm" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "    ${GREEN}✓ WebM created successfully${NC}"
    else
        echo -e "    ${RED}✗ WebM conversion failed${NC}"
    fi
    
    echo
}

# Convert demo videos
echo "Looking for demo video files..."

# Convert demo1_video.mov
convert_video "demo1_video.mov" "demo1_video"
convert_video "public/demo1_video.mov" "demo1_video"

# Convert demo1_dark_video.mov
convert_video "demo1_dark_video.mov" "demo1_dark_video"
convert_video "public/demo1_dark_video.mov" "demo1_dark_video"

# Convert demo2_video.mov (if it exists)
convert_video "demo2_video.mov" "demo2_video"
convert_video "public/demo2_video.mov" "demo2_video"

# Convert demo2_dark_video.mov (if it exists)
convert_video "demo2_dark_video.mov" "demo2_dark_video"
convert_video "public/demo2_dark_video.mov" "demo2_dark_video"

echo -e "${GREEN}Video conversion complete!${NC}"
echo
echo "Generated files in public/ directory:"
ls -la public/*.mp4 public/*.webm 2>/dev/null | grep -E '\.(mp4|webm)$' || echo "No converted files found"
echo
echo -e "${YELLOW}Note:${NC} Make sure to place your original .mov files in the project root or public/ directory"
echo "before running this script."
