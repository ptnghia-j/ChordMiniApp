import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { getStorageInstance } from '@/config/firebase';
import { Timestamp } from 'firebase/firestore';

// Interface for audio file data with enhanced metadata
export interface AudioFileData {
  videoId: string;
  audioUrl: string;
  videoUrl?: string | null;
  title: string; // Clean video title for display (from search results) - REQUIRED
  storagePath: string;
  videoStoragePath?: string | null;
  fileSize: number;
  videoFileSize?: number;
  duration?: number;
  createdAt: Timestamp;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;

  // Enhanced metadata fields
  channelTitle?: string; // Channel name from YouTube search results
  thumbnail?: string; // Video thumbnail URL
  extractionService?: string; // Which service was used (yt-mp3-go, quicktube, yt-dlp)
  extractionTimestamp?: number; // When the audio was extracted
  videoDescription?: string; // Video description (optional)
  videoDuration?: string; // Original duration string from YouTube (e.g., "PT3M33S")
  videoPublishedAt?: string; // When the video was published
  videoViewCount?: number; // View count at time of extraction
}

/**
 * Find existing Firebase Storage audio file for a video ID
 * 
 * PERFORMANCE P0-B: Check Firestore metadata first (O(1) doc lookup) before
 * falling back to expensive listAll() which scans ALL files in the storage bucket.
 * 
 * @param videoId YouTube video ID
 * @returns Object with download URL and storage path if found, null otherwise
 */
export async function findExistingAudioFile(
  videoId: string
): Promise<{
  audioUrl: string;
  storagePath: string;
  fileSize?: number;
} | null> {
  const storage = await getStorageInstance();

  if (!storage) {
    console.warn('Firebase Storage not initialized');
    return null;
  }

  try {
    // List all files in the audio directory
    const audioRef = ref(storage, 'audio');
    const listResult = await listAll(audioRef);

    // Look for files matching the pattern: audio_[videoId]_*.mp3
    const matchingFiles = listResult.items.filter(item => {
      const fileName = item.name;
      return fileName.includes(`[${videoId}]`) && fileName.endsWith('.mp3');
    });

    if (matchingFiles.length === 0) {
      console.log(`❌ No existing audio file found in Firebase Storage for ${videoId}`);
      return null;
    }

    // Use the most recent file (last in the list)
    const audioFile = matchingFiles[matchingFiles.length - 1];
    console.log(`✅ Found existing audio file in Firebase Storage: ${audioFile.name} (slow path)`);

    // Get the download URL
    const audioUrl = await getDownloadURL(audioFile);

    // Try to get file size from metadata
    let fileSize: number | undefined;
    try {
      const { getMetadata } = await import('firebase/storage');
      const metadata = await getMetadata(audioFile);
      fileSize = metadata.size;
    } catch (metadataError) {
      console.warn('Could not get file metadata:', metadataError);
    }

    return {
      audioUrl,
      storagePath: audioFile.fullPath,
      fileSize
    };

  } catch (error) {
    console.error(`❌ Error searching Firebase Storage for ${videoId}:`, error);
    return null;
  }
}

/**
 * Find existing Firebase Storage audio files for multiple video IDs
 * @param videoIds Array of YouTube video IDs
 * @returns Map of video IDs to their Firebase Storage audio data
 */
export async function findExistingAudioFiles(
  videoIds: string[]
): Promise<Map<string, {
  audioUrl: string;
  storagePath: string;
  fileSize?: number;
}>> {
  const results = new Map<string, {
    audioUrl: string;
    storagePath: string;
    fileSize?: number;
  }>();

  if (videoIds.length === 0) {
    return results;
  }

  // Get Firebase Storage instance (ensures initialization)
  const storage = await getStorageInstance();

  if (!storage) {
    return results;
  }

  try {
    console.log(`🔍 Batch searching Firebase Storage for ${videoIds.length} video IDs`);

    // List all files in the audio directory
    const audioRef = ref(storage, 'audio');
    const listResult = await listAll(audioRef);

    // Create a map of video IDs to their matching files
    const videoIdToFiles = new Map<string, typeof listResult.items[0][]>();

    for (const videoId of videoIds) {
      const matchingFiles = listResult.items.filter(item => {
        const fileName = item.name;
        return fileName.includes(`[${videoId}]`) && fileName.endsWith('.mp3');
      });

      if (matchingFiles.length > 0) {
        videoIdToFiles.set(videoId, matchingFiles);
      }
    }

    console.log(`✅ Found Firebase Storage files for ${videoIdToFiles.size}/${videoIds.length} videos`);

    // Get download URLs for found files
    for (const [videoId, files] of videoIdToFiles.entries()) {
      try {
        // Use the most recent file (last in the list)
        const audioFile = files[files.length - 1];
        const audioUrl = await getDownloadURL(audioFile);

        // Try to get file size from metadata
        let fileSize: number | undefined;
        try {
          const { getMetadata } = await import('firebase/storage');
          const metadata = await getMetadata(audioFile);
          fileSize = metadata.size;
        } catch (metadataError) {
          console.warn(`Could not get file metadata for ${videoId}:`, metadataError);
        }

        results.set(videoId, {
          audioUrl,
          storagePath: audioFile.fullPath,
          fileSize
        });

        console.log(`🎵 Firebase Storage found for ${videoId}: ${audioFile.name}`);

      } catch (urlError) {
        console.warn(`Failed to get download URL for ${videoId}:`, urlError);
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Error batch searching Firebase Storage:', error);
    return results;
  }
}

/**
 * Upload an audio file to Firebase Storage
 * @param videoId YouTube video ID
 * @param audioFile Audio file to upload
 * @param videoFile Optional video file to upload
 * @returns Object with download URLs and storage paths
 */
export async function uploadAudioFile(
  videoId: string,
  audioFile: File | Blob | ArrayBuffer,
  videoFile?: File | Blob | ArrayBuffer
): Promise<{
  audioUrl: string;
  videoUrl?: string;
  storagePath: string;
  videoStoragePath?: string;
} | null> {
  // Get Firebase Storage instance (ensures initialization)
  const storage = await getStorageInstance();

  if (!storage) {
    console.warn('Firebase Storage not initialized, skipping upload');
    return null;
  }

  try {
    console.log(`Uploading audio file for video ID: ${videoId}, size: ${
      audioFile instanceof ArrayBuffer
        ? audioFile.byteLength
        : audioFile instanceof Blob
          ? audioFile.size
          : 'unknown'
    } bytes`);

    // Create unique file names with YouTube ID in brackets to match storage rules
    const timestamp = Date.now();
    const audioFileName = `audio_[${videoId}]_${timestamp}.mp3`;
    const audioStoragePath = `audio/${audioFileName}`;

    // Create storage reference
    const audioStorageRef = ref(storage, audioStoragePath);

    try {
      // Convert ArrayBuffer to Blob if needed
      let audioBlob: Blob;
      if (audioFile instanceof ArrayBuffer) {
        audioBlob = new Blob([audioFile], { type: 'audio/mpeg' });
        console.log('Converted ArrayBuffer to Blob for upload');
      } else {
        audioBlob = audioFile as Blob;
      }

      // Upload audio file
      console.log(`Starting upload of audio file to ${audioStoragePath}`);
      const audioSnapshot = await uploadBytes(audioStorageRef, audioBlob);
      console.log('Audio file uploaded successfully, size:', audioSnapshot.metadata.size);

      // Get download URL
      const audioUrl = await getDownloadURL(audioSnapshot.ref);
      console.log(`Generated public download URL: ${audioUrl}`);

      let videoUrl: string | undefined;
      let videoStoragePath: string | undefined;

      // Upload video file if provided
      if (videoFile) {
        const videoFileName = `video_[${videoId}]_${timestamp}.mp4`;
        videoStoragePath = `video/${videoFileName}`;
        const videoStorageRef = ref(storage, videoStoragePath);

        // Convert ArrayBuffer to Blob if needed
        let videoBlob: Blob;
        if (videoFile instanceof ArrayBuffer) {
          videoBlob = new Blob([videoFile], { type: 'video/mp4' });
          console.log('Converted ArrayBuffer to Blob for upload');
        } else {
          videoBlob = videoFile as Blob;
        }

        console.log(`Starting upload of video file to ${videoStoragePath}`);
        const videoSnapshot = await uploadBytes(videoStorageRef, videoBlob);
        console.log('Video file uploaded successfully, size:', videoSnapshot.metadata.size);

        videoUrl = await getDownloadURL(videoSnapshot.ref);
        console.log(`Generated public download URL for video: ${videoUrl}`);
      }

      return {
        audioUrl,
        videoUrl,
        storagePath: audioStoragePath,
        videoStoragePath
      };
    } catch (uploadError) {
      console.error('Error during Firebase Storage upload operation:', uploadError);
      if (uploadError instanceof Error) {
        console.error('Upload error message:', uploadError.message);
        console.error('Upload error stack:', uploadError.stack);
      }

      // PRODUCTION FIX: Don't fall back to local storage in production
      // Instead, throw the error to force proper error handling
      throw new Error(`Firebase Storage upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in uploadAudioFile:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

/**
 * Save audio file metadata to Firestore using video ID as primary key
 * @param audioFileData Audio file data to save
 * @returns True if successful, false otherwise
 */
export async function saveAudioFileMetadata(
  audioFileData: Omit<AudioFileData, 'createdAt'>
): Promise<boolean> {
  console.info(
    `Skipping deprecated audioFiles metadata write for ${audioFileData.videoId}; Firebase Storage is the active source of truth.`
  );
  return true;
}

/**
 * Get audio file metadata from Firestore
 * @param videoId YouTube video ID
 * @returns Audio file data if found, null otherwise
 */
export async function getAudioFileMetadata(videoId: string): Promise<AudioFileData | null> {
  try {
    const existingFile = await findExistingAudioFile(videoId);
    if (!existingFile) {
      return null;
    }

    return {
      videoId,
      audioUrl: existingFile.audioUrl,
      title: `YouTube Video ${videoId}`,
      storagePath: existingFile.storagePath,
      fileSize: existingFile.fileSize || 0,
      createdAt: Timestamp.now(),
      isStreamUrl: false,
    };
  } catch (error) {
    console.error('Error getting audio file metadata from Firestore:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

/**
 * Save YouTube stream URL metadata to Firestore
 * @param videoId YouTube video ID
 * @param audioUrl YouTube stream URL
 * @param streamExpiresAt Expiration timestamp for the stream URL
 * @param videoUrl Optional video URL
 * @returns True if successful, false otherwise
 */
export async function saveStreamUrlMetadata(
  videoId: string,
  audioUrl: string,
  streamExpiresAt: number,
  videoUrl?: string
): Promise<boolean> {
  console.info(
    `Skipping deprecated audioFiles stream metadata write for ${videoId}; transient stream URLs are no longer persisted in Firestore.`
  );
  void audioUrl;
  void streamExpiresAt;
  void videoUrl;
  return true;
}

/**
 * Get cached audio file with validation
 * @param videoId YouTube video ID
 * @returns Cached audio file data if valid, null otherwise
 */
export async function getCachedAudioFile(videoId: string): Promise<AudioFileData | null> {
  return await getAudioFileMetadata(videoId);
}

/**
 * Delete an audio file from Firebase Storage
 * @param storagePath Storage path of the file to delete
 * @returns True if successful, false otherwise
 */
export async function deleteAudioFile(storagePath: string): Promise<boolean> {
  // Get Firebase Storage instance (ensures initialization)
  const storage = await getStorageInstance();

  if (!storage) {
    console.warn('Firebase Storage not initialized, skipping delete');
    return false;
  }

  try {
    console.log(`Deleting audio file: ${storagePath}`);

    // Create storage reference
    const storageRef = ref(storage, storagePath);

    // Delete the file
    await deleteObject(storageRef);

    console.log('Audio file deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting file from Firebase Storage:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return false;
  }
}
