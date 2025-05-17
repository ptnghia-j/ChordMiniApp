import os
import sys

# Add the Chord-CNN-LSTM directory to the Python path
chord_cnn_lstm_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'Chord-CNN-LSTM')
sys.path.insert(0, chord_cnn_lstm_dir)

# Try to import the chord_recognition module
try:
    from chord_recognition import chord_recognition
    print("Successfully imported chord_recognition module")
except Exception as e:
    print(f"Error importing chord_recognition module: {e}")
    sys.exit(1)

# Print the current working directory
print(f"Current working directory: {os.getcwd()}")

# Print the model names
from chord_recognition import MODEL_NAMES
print(f"Model names: {MODEL_NAMES}")

# Check if the model files exist
for model_name in MODEL_NAMES:
    if os.path.exists(model_name):
        print(f"Model file exists: {model_name}")
    else:
        print(f"Model file does not exist: {model_name}")
