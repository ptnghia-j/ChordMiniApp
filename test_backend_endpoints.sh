#!/bin/bash
# Test script for ChordMini Backend API endpoints
# Tests beat detection (beat-transformer, madmom) and chord recognition (chord-cnn-lstm)

BACKEND_URL="https://chordmini-backend-ouqoeeszja-uc.a.run.app"
AUDIO_FILE="downloads/Let_It_Be_Piano_Version.mp3"
OUTPUT_DIR="test_results"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo "ChordMini Backend API Endpoint Testing"
echo "=========================================="
echo "Backend URL: $BACKEND_URL"
echo "Test Audio: $AUDIO_FILE"
echo "Audio Size: $(ls -lh "$AUDIO_FILE" | awk '{print $5}')"
echo ""

# Function to test beat detection endpoint
test_beat_detection() {
    local model=$1
    local output_file="$OUTPUT_DIR/beat_${model}_response.json"

    echo "----------------------------------------"
    echo "Testing Beat Detection: $model"
    echo "----------------------------------------"

    # Measure time and make request
    local start_time=$(date +%s.%N)

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        -X POST \
        -F "file=@$AUDIO_FILE" \
        -F "detector=$model" \
        "$BACKEND_URL/api/detect-beats")

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    # Check response
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ HTTP Status: $http_code${NC}"
        
        # Check if response contains beat data
        if grep -q "beats" "$output_file"; then
            beat_count=$(jq '.beats | length' "$output_file" 2>/dev/null || echo "N/A")
            echo -e "${GREEN}✓ Response contains beat data${NC}"
            echo "  Beat count: $beat_count"
        else
            echo -e "${RED}✗ Response missing beat data${NC}"
        fi
        
        # Check for errors
        if grep -q "error" "$output_file"; then
            error_msg=$(jq -r '.error' "$output_file" 2>/dev/null || echo "Unknown error")
            echo -e "${YELLOW}⚠ Warning: $error_msg${NC}"
        fi
    else
        echo -e "${RED}✗ HTTP Status: $http_code${NC}"
        cat "$output_file"
    fi
    
    echo "Response Time: ${duration}s"
    echo "Response saved to: $output_file"
    echo ""
    
    # Return duration for summary table
    echo "$duration"
}

# Function to test chord recognition endpoint
test_chord_recognition() {
    local model=$1
    local output_file="$OUTPUT_DIR/chord_${model}_response.json"

    echo "----------------------------------------"
    echo "Testing Chord Recognition: $model"
    echo "----------------------------------------"

    # Measure time and make request
    local start_time=$(date +%s.%N)

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        -X POST \
        -F "file=@$AUDIO_FILE" \
        -F "detector=$model" \
        "$BACKEND_URL/api/recognize-chords")

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    # Check response
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ HTTP Status: $http_code${NC}"
        
        # Check if response contains chord data
        if grep -q "chords" "$output_file"; then
            chord_count=$(jq '.chords | length' "$output_file" 2>/dev/null || echo "N/A")
            echo -e "${GREEN}✓ Response contains chord data${NC}"
            echo "  Chord count: $chord_count"
        else
            echo -e "${RED}✗ Response missing chord data${NC}"
        fi
        
        # Check for errors
        if grep -q "error" "$output_file"; then
            error_msg=$(jq -r '.error' "$output_file" 2>/dev/null || echo "Unknown error")
            echo -e "${YELLOW}⚠ Warning: $error_msg${NC}"
        fi
    else
        echo -e "${RED}✗ HTTP Status: $http_code${NC}"
        cat "$output_file"
    fi
    
    echo "Response Time: ${duration}s"
    echo "Response saved to: $output_file"
    echo ""
    
    # Return duration for summary table
    echo "$duration"
}

# Run tests
echo "Starting endpoint tests..."
echo ""

# Test 1: Beat Transformer
bt_time=$(test_beat_detection "beat-transformer")

# Test 2: Madmom
madmom_time=$(test_beat_detection "madmom")

# Test 3: Chord CNN-LSTM
chord_time=$(test_chord_recognition "chord-cnn-lstm")

# Summary table
echo "=========================================="
echo "PERFORMANCE SUMMARY"
echo "=========================================="
echo "Endpoint                         Response Time"
echo "------------------------------------------"
echo "Beat Detection (beat-transformer)    ${bt_time}s"
echo "Beat Detection (madmom)              ${madmom_time}s"
echo "Chord Recognition (chord-cnn-lstm)   ${chord_time}s"
echo "=========================================="

# Determine fastest model
echo ""
echo "Fastest Model:"
bt_faster=$(echo "$bt_time < $madmom_time" | bc -l)
if [ "$bt_faster" -eq 1 ]; then
    echo "  Beat Detection: beat-transformer (${bt_time}s)"
else
    echo "  Beat Detection: madmom (${madmom_time}s)"
fi

echo ""
echo "All test results saved to: $OUTPUT_DIR/"

