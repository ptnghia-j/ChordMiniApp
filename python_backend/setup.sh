#!/bin/bash

# Exit on error
set -e

echo "Setting up Python backend for Chord Mini App..."

# Create a virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Virtual environment already exists."
fi

# Activate the virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Setup completed successfully!"
echo "To activate the environment, run: source venv/bin/activate"
echo "To start the server, run: python app.py" 