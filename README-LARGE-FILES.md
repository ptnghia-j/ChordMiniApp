# Handling Large Audio Files

This application can now process large audio files for beat detection and chord analysis. While we've improved handling for large files, there are still some best practices to follow for optimal performance.

## Updated File Size Support

- **Small files (under 20MB)**: These can be processed using any detector (auto, librosa, or beat-transformer) with no special handling.
- **Medium files (20-30MB)**: These work with beat-transformer but may take longer to process.
- **Large files (30-150MB)**: These will automatically use the librosa detector for better performance and reliability.
- **Very large files (over 150MB)**: For files larger than 150MB, use the audio_path method described below.

## How Our System Handles Large Files

1. Files over 20MB will show a warning in the console.
2. Files over 30MB will automatically use the librosa detector regardless of your selection.
3. Files up to 150MB can now be uploaded directly.
4. Upload progress tracking is available for large files.

## Using Progress Tracking for Large Files

For large file uploads, you can now track the progress:

```typescript
import { detectBeatsFromFile } from '@/services/beatDetectionService';

// In your component:
const handleLargeFile = async (file: File) => {
  try {
    const result = await detectBeatsFromFile(
      file,
      'librosa',  // Recommended for large files
      (percent) => {
        // Update progress bar or display percentage
        console.log(`Upload progress: ${percent}%`);
      }
    );
    
    if (result.success) {
      // Process beat information
      console.log(`Detected ${result.total_beats} beats at ${result.bpm} BPM`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
};
```

## Using the Audio Path Method for Very Large Files

For files larger than 150MB, use the audio_path method:

1. Place your audio file in a directory accessible to the Python backend.
2. Use the `detectBeatsFromPath` function in the frontend:

```typescript
import { detectBeatsFromPath } from '@/services/beatDetectionService';

// In your component:
const handleVeryLargeFile = async () => {
  const result = await detectBeatsFromPath(
    '/path/to/your/file.mp3',
    'librosa'  // Recommended for large files
  );
  
  if (result.success) {
    // Process beat information
    console.log(`Detected ${result.total_beats} beats at ${result.bpm} BPM`);
  } else {
    console.error(`Error: ${result.error}`);
  }
};
```

## Recommendations for Best Results

1. **Use shorter audio clips**: If possible, trim your audio to just the section you need.
2. **Consider file compression**: MP3 format at 128-192kbps provides good quality with smaller file sizes.
3. **Use the librosa detector**: For all large files, librosa provides more reliable processing.

## Starting the Server with Custom Maximum Size

You can adjust the maximum file size by setting an environment variable:

```bash
FLASK_MAX_CONTENT_LENGTH_MB=200 python python_backend/app.py
```

Or use our provided script:

```bash
./scripts/start_python_backend.sh
```

This script will handle all necessary setup and start the Flask server with support for large files. 