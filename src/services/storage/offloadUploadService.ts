/**
 * Firebase Offload Upload Service
 *
 * Handles large-file offloading to Firebase Storage so requests avoid the
 * serverless multipart body limit.
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { isLocalBackend } from '@/utils/backendConfig';

export interface OffloadUploadResult {
  success: boolean;
  data?: unknown;
  error?: string;
  blobUrl?: string;
  processingTime?: number;
}

class OffloadUploadService {
  // Keep this aligned with serverless body constraints.
  private readonly REQUEST_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;
  private readonly MULTIPART_BODY_HEADROOM_BYTES = 512 * 1024;
  private readonly FIREBASE_OFFLOAD_PREFIX = 'temp';

  /**
   * Check if we are running in localhost development mode.
   */
  private isLocalhostDevelopment(): boolean {
    return isLocalBackend();
  }

  /**
   * Client upload SDK path is browser-only.
   */
  private isServerSide(): boolean {
    return typeof window === 'undefined';
  }

  private isFirebaseConfigured(): boolean {
    if (typeof window !== 'undefined') {
      return true;
    }

    return !!(
      typeof process !== 'undefined'
      && process.env
      && (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET)
    );
  }

  /**
   * Check if file should use offload upload based on environment and file size.
   */
  shouldUseOffloadUpload(fileSize: number): boolean {
    if (this.isLocalhostDevelopment()) {
      return false;
    }

    // Client-upload SDKs are browser-only; server-side should keep direct flow.
    if (this.isServerSide()) {
      console.debug('Skipping offload upload in server-side context (Docker/API routes)');
      return false;
    }

    const sizeThreshold = this.REQUEST_BODY_LIMIT_BYTES - this.MULTIPART_BODY_HEADROOM_BYTES;
    const isLargeFile = fileSize > sizeThreshold;
    const isConfigured = this.isFirebaseConfigured();

    if (isLargeFile && !isConfigured) {
      console.warn(
        `⚠️ Large file detected but Firebase offload is unavailable. File: ${this.getFileSizeString(fileSize)}, Limit: ${this.getFileSizeString(this.REQUEST_BODY_LIMIT_BYTES)}`,
      );
    }

    return isLargeFile && isConfigured;
  }

  /**
   * Compatibility alias.
   */
  shouldUseBlobUpload(fileSize: number): boolean {
    return this.shouldUseOffloadUpload(fileSize);
  }

  /**
   * Check whether Firebase offload upload is available.
   */
  isOffloadUploadAvailable(): boolean {
    return this.isFirebaseConfigured();
  }

  /**
   * Compatibility alias.
   */
  isBlobUploadAvailable(): boolean {
    return this.isOffloadUploadAvailable();
  }

  /**
   * Get human-readable file size.
   */
  getFileSizeString(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)}MB`;
  }

  private async postOffloadProcessing(endpoint: string, formData: FormData): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: createSafeTimeoutSignal(800000), // 13+ minutes
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.details || `Backend processing failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Compatibility alias.
   */
  private async postBlobProcessing(endpoint: string, formData: FormData): Promise<unknown> {
    return this.postOffloadProcessing(endpoint, formData);
  }

  /**
   * Delete an offload URL via the delete endpoint.
   */
  async deleteOffload(offloadUrl: string): Promise<void> {
    if (!offloadUrl) return;

    try {
      const response = await fetch('/api/blob/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: offloadUrl }),
        keepalive: true,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.warn('⚠️ Offload deletion returned non-OK status (non-critical):', response.status, payload);
      }
    } catch (error) {
      console.warn('⚠️ Offload deletion request failed (non-critical):', error);
    }
  }

  /**
   * Compatibility alias.
   */
  async deleteBlob(blobUrl: string): Promise<void> {
    return this.deleteOffload(blobUrl);
  }

  private async uploadToFirebase(audioFile: File): Promise<string> {
    try {
      if (audioFile.size > 100 * 1024 * 1024) {
        throw new Error(`File too large for Firebase offload (${this.getFileSizeString(audioFile.size)}). Maximum allowed size is 100MB.`);
      }

      const {
        getDownloadURL,
        ref,
        uploadBytesResumable,
      } = await import('firebase/storage');
      const { getStorageInstance, ensureAuthReady } = await import('@/config/firebase');

      // Best effort auth warmup: this avoids first-request races on projects
      // whose rules require auth for temp writes.
      const authReady = await ensureAuthReady(15000).catch(() => false);
      if (!authReady) {
        console.warn('⚠️ Firebase auth was not ready before offload upload; continuing with current rules.');
      }

      const storage = await getStorageInstance();

      const timestamp = Date.now();
      const sanitizedName = audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${this.FIREBASE_OFFLOAD_PREFIX}/${timestamp}-${sanitizedName}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, audioFile, {
        contentType: audioFile.type || 'audio/mpeg',
        customMetadata: {
          offload: 'true',
          cleanup: 'auto',
          uploadedAt: new Date().toISOString(),
        },
      });

      const snapshot = await new Promise<{ ref: Parameters<typeof getDownloadURL>[0] }>((resolve, reject) => {
        uploadTask.on('state_changed', undefined, reject, () => resolve(uploadTask.snapshot));
      });

      return getDownloadURL(snapshot.ref);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isPermissionError =
        errorMessage.includes('storage/unauthorized')
        || errorMessage.includes('permission')
        || errorMessage.includes('403');

      if (isPermissionError) {
        throw new Error(
          `Firebase offload upload failed: permission denied for temp uploads. Verify Storage rules allow read/create/update on temp/*, and check App Check/auth enforcement settings. Original error: ${errorMessage}`,
        );
      }

      throw new Error(`Firebase offload upload failed: ${errorMessage}`);
    }
  }

  /**
   * Upload file to Firebase offload storage.
   */
  async uploadToOffload(audioFile: File): Promise<string> {
    return this.uploadToFirebase(audioFile);
  }

  /**
   * Compatibility alias.
   */
  async uploadToBlob(audioFile: File): Promise<string> {
    return this.uploadToOffload(audioFile);
  }

  async detectBeatsFromOffloadUrl(
    offloadUrl: string,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', offloadUrl);
      formData.append('detector', detector);
      formData.append('delete_blob', options.deleteAfterProcessing === false ? '0' : '1');

      if (detector === 'beat-transformer') {
        formData.append('force', 'true');
      }

      const result = await this.postBlobProcessing('/api/detect-beats-blob', formData);

      return {
        success: true,
        data: result,
        blobUrl: offloadUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Offload beat detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async detectBeatsFromBlobUrl(
    blobUrl: string,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    return this.detectBeatsFromOffloadUrl(blobUrl, detector, options);
  }

  async recognizeChordsFromOffloadUrl(
    offloadUrl: string,
    model: string = 'chord-cnn-lstm',
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', offloadUrl);
      formData.append('model', model);
      formData.append('detector', model);
      formData.append('chord_dict', (model === 'btc-sl' || model === 'btc-pl') ? 'large_voca' : 'full');
      formData.append('delete_blob', options.deleteAfterProcessing === false ? '0' : '1');

      const result = await this.postBlobProcessing('/api/recognize-chords-blob', formData);

      return {
        success: true,
        data: result,
        blobUrl: offloadUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Offload chord recognition failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async recognizeChordsFromBlobUrl(
    blobUrl: string,
    model: string = 'chord-cnn-lstm',
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    return this.recognizeChordsFromOffloadUrl(blobUrl, model, options);
  }

  async transcribeSheetSageFromOffloadUrl(
    offloadUrl: string,
    videoId?: string,
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', offloadUrl);
      formData.append('delete_blob', options.deleteAfterProcessing === false ? '0' : '1');
      if (videoId) {
        formData.append('videoId', videoId);
      }

      const payload = await this.postBlobProcessing('/api/transcribe-sheetsage', formData) as {
        success?: boolean;
        data?: unknown;
        error?: string;
      };

      if (!payload?.success || !payload?.data) {
        throw new Error(payload?.error || 'Sheet Sage transcription failed');
      }

      return {
        success: true,
        data: payload.data,
        blobUrl: offloadUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Sheet Sage offload transcription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async transcribeSheetSageFromBlobUrl(
    blobUrl: string,
    videoId?: string,
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    return this.transcribeSheetSageFromOffloadUrl(blobUrl, videoId, options);
  }

  async transcribeSheetSageOffloadUpload(
    audioFile: File,
    videoId?: string,
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(35);

      const result = await this.transcribeSheetSageFromOffloadUrl(blobUrl, videoId, {
        deleteAfterProcessing: true,
      });

      if (onProgress) onProgress(100);

      return {
        ...result,
        blobUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async transcribeSheetSageBlobUpload(
    audioFile: File,
    videoId?: string,
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    return this.transcribeSheetSageOffloadUpload(audioFile, videoId, onProgress);
  }

  /**
   * Detect beats using offload upload for large files.
   */
  async detectBeatsOffloadUpload(
    audioFile: File,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      // Step 1: Upload to offload storage
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send offload URL to Python backend for processing
      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.detectBeatsFromOffloadUrl(blobUrl, detector, {
        deleteAfterProcessing: true,
      });

      const processingTime = Date.now() - startTime;

      if (onProgress) onProgress(100);

      return {
        ...result,
        blobUrl,
        processingTime,
      };
    } catch (error) {
      console.error('❌ Offload beat detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async detectBeatsBlobUpload(
    audioFile: File,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    return this.detectBeatsOffloadUpload(audioFile, detector, onProgress);
  }

  /**
   * Recognize chords using offload upload for large files.
   */
  async recognizeChordsOffloadUpload(
    audioFile: File,
    model: string = 'chord-cnn-lstm',
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      // Step 1: Upload to offload storage
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send offload URL to Python backend for processing
      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.recognizeChordsFromOffloadUrl(blobUrl, model, {
        deleteAfterProcessing: true,
      });

      const processingTime = Date.now() - startTime;

      if (onProgress) onProgress(100);

      return {
        ...result,
        blobUrl,
        processingTime,
      };
    } catch (error) {
      console.error('❌ Offload chord recognition failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compatibility alias.
   */
  async recognizeChordsBlobUpload(
    audioFile: File,
    model: string = 'chord-cnn-lstm',
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    return this.recognizeChordsOffloadUpload(audioFile, model, onProgress);
  }

  /**
   * Process audio file with automatic routing based on environment and file size.
   * - Localhost development: Always use direct Python backend (no offload upload)
   * - Production small files (below size threshold with multipart headroom): standard proxy
   * - Production larger files: Firebase offload upload
   */
  async processAudioFile(
    audioFile: File,
    operation: 'detect-beats' | 'recognize-chords',
    options: {
      detector?: 'auto' | 'madmom' | 'beat-transformer';
      model?: string;
      onProgress?: (percent: number) => void;
    } = {},
  ): Promise<OffloadUploadResult> {
    const { detector = 'beat-transformer', model = 'chord-cnn-lstm', onProgress } = options;

    // Check if we should use offload upload (considers both environment and file size)
    if (this.shouldUseOffloadUpload(audioFile.size)) {
      if (operation === 'detect-beats') {
        return this.detectBeatsOffloadUpload(audioFile, detector, onProgress);
      }

      return this.recognizeChordsOffloadUpload(audioFile, model, onProgress);
    }

    // Return special result indicating to use the standard flow
    return {
      success: false,
      error: 'USE_STANDARD_FLOW',
    };
  }
}

export const offloadUploadService = new OffloadUploadService();
