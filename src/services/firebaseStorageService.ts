import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { doc, getDoc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';

// Collection name for audio files
const AUDIO_FILES_COLLECTION = 'audioFiles';

// Interface for audio file data
export interface AudioFileData {
  videoId: string;
  audioUrl: string;
  videoUrl?: string | null;
  storagePath: string;
  videoStoragePath?: string | null;
  fileSize: number;
  videoFileSize?: number;
  duration?: number;
  createdAt: Timestamp;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
}

// Extended interface for cached data that may have additional properties
interface CachedAudioFileData extends AudioFileData {
  invalid?: boolean;
  expired?: boolean;
  processedAt?: number;
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
  if (!storage || !db) {
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

    // Create unique file names
    const timestamp = Date.now();
    const audioFileName = `${videoId}_${timestamp}.mp3`;
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
        const videoFileName = `${videoId}_${timestamp}.mp4`;
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

      // Create fallback URLs for local files
      const audioUrl = `/audio/${audioFileName}`;
      const videoUrl = videoFile ? `/audio/${videoId}_${timestamp}.mp4` : undefined;

      // Save the audio file to the local filesystem
      try {
        // We're already in the server-side code, so we can't directly save to the filesystem
        // Instead, we'll return the local URLs and let the caller handle saving the files
        console.log('Using fallback local storage for audio files');

        return {
          audioUrl,
          videoUrl,
          storagePath: audioStoragePath,
          videoStoragePath: videoFile ? `video/${videoId}_${timestamp}.mp4` : undefined
        };
      } catch (fallbackError) {
        console.error('Error creating fallback URLs:', fallbackError);
        return null;
      }
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
 * Save audio file metadata to Firestore
 * @param audioFileData Audio file data to save
 * @returns True if successful, false otherwise
 */
export async function saveAudioFileMetadata(
  audioFileData: Omit<AudioFileData, 'createdAt'>
): Promise<boolean> {
  if (!db) {
    console.warn('Firebase not initialized, skipping audio file metadata save');
    return false;
  }

  try {
    console.log('Saving audio file metadata to Firestore:', {
      videoId: audioFileData.videoId,
      fileSize: audioFileData.fileSize
    });

    // Create a unique document ID based on the video ID
    const docId = audioFileData.videoId;

    // Get the document reference
    const docRef = doc(db, AUDIO_FILES_COLLECTION, docId);

    // Prepare data for Firestore - sanitize undefined values
    const sanitizedData = {
      videoId: audioFileData.videoId,
      audioUrl: audioFileData.audioUrl,
      videoUrl: audioFileData.videoUrl || null,
      storagePath: audioFileData.storagePath,
      videoStoragePath: audioFileData.videoStoragePath || null,
      fileSize: audioFileData.fileSize,
      videoFileSize: audioFileData.videoFileSize || null,
      duration: audioFileData.duration || null,
      isStreamUrl: audioFileData.isStreamUrl || false,
      streamExpiresAt: audioFileData.streamExpiresAt || null,
      createdAt: serverTimestamp()
    };

    // Save the document
    await setDoc(docRef, sanitizedData);

    console.log('Audio file metadata saved successfully to Firestore');
    return true;
  } catch (error) {
    console.error('Error saving audio file metadata to Firestore:', error);

    // Check for specific permission errors
    if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
      console.warn('Firestore permissions not configured for audio file metadata. This is expected in development.');
      console.warn('To fix this, update your Firestore security rules to allow writes to the audioFiles collection.');
    }

    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return false;
  }
}

/**
 * Get audio file metadata from Firestore
 * @param videoId YouTube video ID
 * @returns Audio file data if found, null otherwise
 */
export async function getAudioFileMetadata(videoId: string): Promise<AudioFileData | null> {
  if (!db) {
    console.warn('Firebase not initialized, skipping audio file metadata retrieval');
    return null;
  }

  try {
    console.log(`Checking for cached audio file: videoId=${videoId}`);

    // Get the document reference
    const docRef = doc(db, AUDIO_FILES_COLLECTION, videoId);

    // Get the document
    const docSnap = await getDoc(docRef);

    // Check if the document exists
    if (docSnap.exists()) {
      console.log('Found cached audio file in Firestore');
      const data = docSnap.data() as CachedAudioFileData;

      // Check if the entry is already marked as invalid or expired
      if (data.invalid || data.expired) {
        console.log(`Cache entry for ${videoId} is marked as ${data.invalid ? 'invalid' : 'expired'}, will re-download`);
        return null;
      }

      // For stream URLs, check if they're expired
      if (data.isStreamUrl && data.streamExpiresAt) {
        const now = Date.now();
        if (now > data.streamExpiresAt) {
          console.log(`Stream URL for ${videoId} has expired, will re-extract`);

          // Mark the entry as expired
          setDoc(docRef, {
            ...data,
            expired: true,
            expirationReason: 'Stream URL expired',
            expirationTimestamp: serverTimestamp()
          }).catch(err => {
            console.error(`Failed to mark stream URL entry for ${videoId} as expired:`, err);
          });

          return null;
        }

        // Stream URL is still valid, return it
        return data;
      }

      // For regular files, check if the entry is too old (more than 7 days)
      const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() :
                        data.createdAt?.seconds ? data.createdAt.seconds * 1000 :
                        data.processedAt || Date.now() - 30 * 24 * 60 * 60 * 1000; // Use processedAt as fallback

      const now = Date.now();
      const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);

      if (ageInDays > 7) {
        console.log(`Cache entry for ${videoId} is ${ageInDays.toFixed(1)} days old, treating as expired`);

        // Mark the entry as expired but don't wait for the operation to complete
        // This avoids slowing down the request
        setDoc(docRef, {
          ...data,
          expired: true,
          expirationReason: 'Age > 7 days',
          expirationTimestamp: serverTimestamp()
        }).then(() => {
          console.log(`Marked cache entry for ${videoId} as expired`);

          // Schedule deletion of storage files in the background (only for non-stream URLs)
          if (!data.isStreamUrl && data.storagePath) {
            deleteAudioFile(data.storagePath)
              .then(() => console.log(`Deleted expired audio file: ${data.storagePath}`))
              .catch(err => console.error(`Failed to delete expired audio file: ${data.storagePath}`, err));
          }

          if (!data.isStreamUrl && data.videoStoragePath) {
            deleteAudioFile(data.videoStoragePath)
              .then(() => console.log(`Deleted expired video file: ${data.videoStoragePath}`))
              .catch(err => console.error(`Failed to delete expired video file: ${data.videoStoragePath}`, err));
          }
        }).catch(err => {
          console.error(`Failed to mark cache entry for ${videoId} as expired:`, err);
        });

        return null;
      }

      // Check if the audioUrl is a public URL
      if (data.audioUrl && (data.audioUrl.startsWith('http://') || data.audioUrl.startsWith('https://'))) {
        console.log(`Audio file has a public URL: ${data.audioUrl}`);

        // Skip URL validation to improve performance
        // The client will handle invalid URLs

        return data;
      } else {
        console.log(`Audio file has a local URL: ${data.audioUrl}`);

        // For Music.ai API, we need a public URL
        // Try to create a public URL using Firebase Storage
        try {
          // Check if we have a storage path
          if (data.storagePath) {
            console.log(`Attempting to get download URL for storage path: ${data.storagePath}`);

            // Import Firebase Storage functions
            const { ref, getDownloadURL } = await import('firebase/storage');
            const { storage } = await import('@/config/firebase');

            if (!storage) {
              console.warn('Firebase Storage not initialized');
              return data;
            }

            // Create storage reference
            const storageRef = ref(storage, data.storagePath);

            // Get download URL
            try {
              const publicUrl = await getDownloadURL(storageRef);
              console.log(`Generated public URL: ${publicUrl}`);

              // Update the data with the public URL
              data.audioUrl = publicUrl;

              // Update the document in Firestore (don't wait for it to complete)
              setDoc(docRef, {
                ...data,
                audioUrl: publicUrl,
                lastUpdated: serverTimestamp()
              }).then(() => {
                console.log('Updated audio file metadata with public URL');
              }).catch(err => {
                console.error('Error updating audio file metadata:', err);
              });
              return data;
            } catch (downloadError) {
              console.error('Error getting download URL:', downloadError);

              // If the file doesn't exist in storage, return null to trigger a re-download
              if (downloadError instanceof Error &&
                  downloadError.toString().includes('storage/object-not-found')) {
                console.log('File not found in Firebase Storage, will trigger re-download');

                // Mark the entry as invalid (don't wait for it to complete)
                setDoc(docRef, {
                  ...data,
                  invalid: true,
                  invalidReason: 'File not found in storage',
                  invalidTimestamp: serverTimestamp()
                }).then(() => {
                  console.log(`Marked cache entry for ${videoId} as invalid`);
                }).catch(err => {
                  console.error(`Failed to mark cache entry for ${videoId} as invalid:`, err);
                });

                return null;
              }

              // For other errors, return the original data
              return data;
            }
          }
        } catch (storageError) {
          console.error('Error accessing Firebase Storage:', storageError);
          // Return the original data even if we couldn't get a public URL
          return data;
        }

        // If we couldn't create a public URL, return the original data
        return data;
      }
    }

    console.log('No cached audio file found in Firestore');
    return null;
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
  if (!db) {
    console.warn('Firebase not initialized, skipping stream URL metadata save');
    return false;
  }

  try {
    console.log('Saving stream URL metadata to Firestore:', {
      videoId,
      streamExpiresAt: new Date(streamExpiresAt).toISOString()
    });

    // Create a unique document ID based on the video ID
    const docId = videoId;

    // Get the document reference
    const docRef = doc(db, AUDIO_FILES_COLLECTION, docId);

    // Prepare data for Firestore
    const streamData = {
      videoId,
      audioUrl,
      videoUrl: videoUrl || null,
      storagePath: '', // No storage path for stream URLs
      videoStoragePath: null,
      fileSize: 0, // No file size for stream URLs
      videoFileSize: null,
      duration: null,
      isStreamUrl: true,
      streamExpiresAt,
      createdAt: serverTimestamp()
    };

    // Save the document
    await setDoc(docRef, streamData);

    console.log('Stream URL metadata saved successfully to Firestore');
    return true;
  } catch (error) {
    console.error('Error saving stream URL metadata to Firestore:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return false;
  }
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
