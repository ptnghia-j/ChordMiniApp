import os
from pathlib import Path

# Define the audio directory path
AUDIO_DIR = Path(__file__).parent.parent / "public" / "audio"
print(f"Audio directory path: {AUDIO_DIR}")

# Test if the directory exists
print(f"Directory exists: {os.path.exists(AUDIO_DIR)}")

# List files in the directory
print("Files in directory:")
for file in os.listdir(AUDIO_DIR):
    print(f"  - {file}")

# Test a specific file path
test_file = "dQw4w9WgXcQ_1747854532079.mp3"
test_path = os.path.join(AUDIO_DIR, test_file)
print(f"Test file path: {test_path}")
print(f"Test file exists: {os.path.exists(test_path)}")

# Test the path resolution logic
relative_path = f"/audio/{test_file}"
print(f"Relative path: {relative_path}")
if relative_path.startswith('/audio/'):
    # Convert to absolute path
    file_name = relative_path[7:]  # Remove '/audio/' prefix
    absolute_path = os.path.join(AUDIO_DIR, file_name)
    print(f"Converted to absolute path: {absolute_path}")
    print(f"Absolute path exists: {os.path.exists(absolute_path)}")
