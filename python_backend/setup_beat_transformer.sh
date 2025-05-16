#!/bin/bash
# Setup script for Beat-Transformer and dependencies

# Exit on error
set -e

echo "Setting up Beat-Transformer environment..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if Beat-Transformer checkpoint exists
CHECKPOINT_DIR="models/Beat-Transformer/checkpoint"
CHECKPOINT_FILE="$CHECKPOINT_DIR/fold_4_trf_param.pt"

if [ ! -f "$CHECKPOINT_FILE" ]; then
    echo "Beat-Transformer checkpoint not found at $CHECKPOINT_FILE"
    
    # Create checkpoint directory if it doesn't exist
    mkdir -p "$CHECKPOINT_DIR"
    
    # Check if we need to download the checkpoint
    echo "Would you like to download the Beat-Transformer checkpoint? (y/n)"
    read -r download_checkpoint
    
    if [[ "$download_checkpoint" =~ ^[Yy]$ ]]; then
        echo "Downloading Beat-Transformer checkpoint..."
        # Replace this URL with the actual URL to the checkpoint
        # This is a placeholder - you'll need to provide the actual URL
        CHECKPOINT_URL="https://example.com/beat-transformer-checkpoint.pt"
        curl -L "$CHECKPOINT_URL" -o "$CHECKPOINT_FILE"
        
        if [ -f "$CHECKPOINT_FILE" ]; then
            echo "Checkpoint downloaded successfully!"
        else
            echo "Failed to download checkpoint. Please download it manually and place it at $CHECKPOINT_FILE"
        fi
    else
        echo "Skipping checkpoint download. Beat-Transformer will not be available."
    fi
else
    echo "Beat-Transformer checkpoint found at $CHECKPOINT_FILE"
fi

# Apply scipy patch
echo "Applying scipy patch..."
python scipy_patch.py

echo "Setup complete!"
echo "To start the server, run: python app.py"
