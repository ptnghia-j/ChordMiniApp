#!/bin/bash

# Start Python Backend Flask Server
# This script ensures the Flask server is started correctly

# Get the absolute path to the project directory
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# Change to the project directory
cd "$PROJECT_DIR"

# Check if pip is having connectivity issues
function check_pip_connectivity {
  echo "Checking pip connectivity..."
  # Try to download a simple package to test connectivity
  python -m pip install --upgrade pip setuptools wheel --quiet

  if [ $? -ne 0 ]; then
    echo "⚠️ Warning: Pip seems to have connectivity issues."
    echo "Trying to continue anyway..."
  fi
}

# Activate the virtual environment if it exists
if [ -d ".venv/bin" ]; then
  echo "Activating virtual environment..."
  source .venv/bin/activate
  VENV_PATH=".venv"
elif [ -d "python_backend/venv/bin" ]; then
  echo "Activating python_backend virtual environment..."
  source python_backend/venv/bin/activate
  VENV_PATH="python_backend/venv"
else
  echo "Creating a new virtual environment..."
  python -m venv .venv
  source .venv/bin/activate
  VENV_PATH=".venv"
fi

# Check pip connectivity
check_pip_connectivity

# Check for required packages without installing
echo "Checking for required packages..."
cd python_backend

# Try to run Flask directly first - if it works, skip pip install
if python -c "import flask" 2>/dev/null; then
  echo "Flask is already installed."
else
  echo "Installing Flask and other required packages..."
  # Installing packages one by one to overcome network issues
  python -m pip install flask --no-cache-dir
  python -m pip install flask-cors --no-cache-dir
  python -m pip install librosa --no-cache-dir
  python -m pip install numpy --no-cache-dir
  python -m pip install soundfile --no-cache-dir
fi

# Set max request size environment variable
export FLASK_MAX_CONTENT_LENGTH_MB="150"

# Start the Flask server
echo "Starting Flask server on port 5000..."
python app.py

# Deactivate the virtual environment when done
deactivate 