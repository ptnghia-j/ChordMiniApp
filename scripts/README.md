# ChordMini Cache Management Scripts

This directory contains utility scripts for managing cached data in the ChordMini application's Firebase Firestore database.

## Scripts Overview

### 🗑️ `delete-cache.js` - Comprehensive Cache Deletion Tool

A flexible command-line tool for deleting various types of cached analysis data that may contain bugs from previous processing runs.

#### Features

- **Multi-collection support**: Delete from translations, lyrics, and transcriptions collections
- **Selective deletion**: Choose specific cache types or combinations
- **Safety features**: Confirmation prompts and force flags
- **Comprehensive logging**: Clear feedback on what's being deleted
- **Error handling**: Graceful handling of missing data and access errors

#### Usage

```bash
# Basic syntax
node delete-cache.js <VIDEO_ID> [OPTIONS]

# Show help
node delete-cache.js --help
```

#### Options

| Flag | Description |
|------|-------------|
| `--translations` | Delete translation cache only (Gemini API translations) |
| `--lyrics` | Delete lyrics transcription cache only (Music.ai API) |
| `--beats` | Delete beat detection cache only |
| `--chords` | Delete chord recognition cache only |
| `--analysis` | Delete both beat and chord cache (`--beats` + `--chords`) |
| `--all` | Delete all cached data for the video |
| `--force` | Skip confirmation prompt |
| `--help` | Show help message |

#### Examples

```bash
# Delete only translation cache for a video
node delete-cache.js Y2ge3KrdeWs --translations

# Delete beat and chord analysis cache
node delete-cache.js Y2ge3KrdeWs --analysis

# Delete all cached data with confirmation
node delete-cache.js Y2ge3KrdeWs --all

# Delete all cached data without confirmation (for automation)
node delete-cache.js Y2ge3KrdeWs --all --force

# Delete multiple specific cache types
node delete-cache.js Y2ge3KrdeWs --lyrics --translations
```

#### Cache Collections

The script targets the following Firebase Firestore collections:

| Collection | Description | Contains |
|------------|-------------|----------|
| `translations` | Lyrics translation cache | Gemini API translation results |
| `lyrics` | Lyrics transcription cache | Music.ai API transcription results |
| `transcriptions` | Beat and chord analysis cache | ML model analysis results |

#### Safety Features

1. **Video ID validation**: Ensures proper YouTube video ID format
2. **Confirmation prompts**: Asks for confirmation before deletion (unless `--force` is used)
3. **Clear feedback**: Shows exactly what will be deleted before proceeding
4. **Error handling**: Continues operation even if some deletions fail
5. **Summary reporting**: Provides detailed results after completion

#### Sample Output

```
🎵 ChordMini Cache Deletion Tool

⚠️  You are about to delete cached data for video: Y2ge3KrdeWs
📋 Target collections:
   • Lyrics translation cache (Gemini API translations)
   • Beat and chord analysis cache (ML model results)

❓ Are you sure you want to proceed? (y/N): y

🚀 Starting cache deletion for video: Y2ge3KrdeWs

🔍 Searching Lyrics translation cache (Gemini API translations)...
  ✅ Deleted: Y2ge3KrdeWs-auto-to-English-abc123
  ✅ Deleted: Y2ge3KrdeWs-Chinese-to-English-def456
  📊 Deleted 2 entries from Lyrics translation cache (Gemini API translations)

🔍 Searching Beat and chord analysis cache (ML model results)...
  ✅ Deleted: Y2ge3KrdeWs_beat-transformer_Chord-CNN-LSTM
  📊 Deleted 1 entries from Beat and chord analysis cache (ML model results)

📊 DELETION SUMMARY
══════════════════════════════════════════════════
Video ID: Y2ge3KrdeWs
Total entries deleted: 3
Errors encountered: 0
✅ Cache deletion completed successfully
```

### 🗑️ `delete-translation-cache.js` - Legacy Translation Cache Deletion

A simpler script specifically for deleting translation cache entries. This script is maintained for backward compatibility.

#### Usage

```bash
node delete-translation-cache.js <VIDEO_ID>
```

## Prerequisites

1. **Environment Setup**: Ensure `.env.local` file contains valid Firebase configuration
2. **Dependencies**: Run `npm install` to install required packages
3. **Firebase Access**: Ensure your Firebase project has proper permissions

## Environment Variables Required

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## Common Use Cases

### 🐛 Development & Debugging

```bash
# Clear all cache for a problematic video during development
node delete-cache.js Y2ge3KrdeWs --all --force

# Clear only analysis cache to re-run ML models
node delete-cache.js Y2ge3KrdeWs --analysis
```

### 🔄 Cache Refresh

```bash
# Clear translation cache to get fresh translations
node delete-cache.js Y2ge3KrdeWs --translations

# Clear lyrics cache to re-transcribe with updated models
node delete-cache.js Y2ge3KrdeWs --lyrics
```

### 🧹 Maintenance

```bash
# Clear all cache for multiple videos (use in a loop)
for video in Y2ge3KrdeWs ABC123def GHI789jkl; do
  node delete-cache.js $video --all --force
done
```

## Error Handling

The scripts handle various error scenarios:

- **Missing Firebase configuration**: Clear error messages about missing environment variables
- **Network issues**: Graceful handling of Firestore connection problems
- **Permission errors**: Clear feedback when access is denied
- **Invalid video IDs**: Validation and helpful error messages

## Best Practices

1. **Always backup important data** before running deletion scripts
2. **Use `--force` flag carefully** - it skips confirmation prompts
3. **Test with single videos first** before batch operations
4. **Monitor Firebase usage** when deleting large amounts of data
5. **Use specific cache types** instead of `--all` when possible

## Troubleshooting

### Common Issues

1. **"Firebase not initialized"**: Check your `.env.local` file
2. **"Permission denied"**: Verify Firebase security rules
3. **"Video ID not found"**: The video may not have any cached data
4. **"Network error"**: Check internet connection and Firebase status

### Getting Help

```bash
# Show detailed help for any script
node delete-cache.js --help
```

## Contributing

When adding new cache collections or features:

1. Update the `CACHE_COLLECTIONS` object in `delete-cache.js`
2. Add appropriate command-line flags
3. Update this README with new options
4. Test thoroughly with various scenarios
