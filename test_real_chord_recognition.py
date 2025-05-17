import os
import sys
import tempfile
from pathlib import Path

# Add the Chord-CNN-LSTM directory to the Python path
chord_cnn_lstm_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'python_backend', 'models', 'Chord-CNN-LSTM')
sys.path.insert(0, chord_cnn_lstm_dir)

# Change to the Chord-CNN-LSTM directory
os.chdir(chord_cnn_lstm_dir)

try:
    # Import the real chord recognition module
    from chord_recognition import chord_recognition
    print("Successfully imported chord_recognition module")

    # Create a temporary file for the lab output
    temp_lab_file = tempfile.NamedTemporaryFile(delete=False, suffix='.lab')
    lab_path = temp_lab_file.name
    temp_lab_file.close()

    # Run chord recognition on a test file
    audio_path = os.path.join(os.path.dirname(chord_cnn_lstm_dir), 'Beat-Transformer', 'test_audio', 'ocean.mp3')
    print(f"Running chord recognition on {audio_path}")

    # Run chord recognition
    chord_recognition(audio_path, lab_path, 'submission')

    # Read and print the lab file
    print("Lab file content:")
    with open(lab_path, 'r') as f:
        print(f.read())

    # Clean up
    os.unlink(lab_path)

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
