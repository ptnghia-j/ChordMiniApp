/**
 * Firebase Offload Upload Service
 *
 * Handles large-file offloading to Firebase Storage so requests avoid the
 * serverless multipart body limit.
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { isLocalBackend } from '@/utils/backendConfig';
import { getAppCheckTokenForApi } from '@/config/firebase';

export interface OffloadUploadResult {
  success: boolean;
  data?: unknown;
  error?: string;
  offloadUrl?: string;
  processingTime?: number;
}

class OffloadUploadService {
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
   * Production should always offload in browser contexts.
   * Local development stays on direct multipart uploads.
   */
  shouldUseOffloadUpload(fileSize?: number): boolean {
    if (this.isLocalhostDevelopment()) {
      return false;
    }

    // Client-upload SDKs are browser-only; server-side should keep direct flow.
    if (this.isServerSide()) {
      console.debug('Skipping offload upload in server-side context (Docker/API routes)');
      return false;
    }

    const isConfigured = this.isFirebaseConfigured();

    if (!isConfigured) {
      console.warn(
        `⚠️ Firebase offload is unavailable for production audio analysis${typeof fileSize === 'number' ? ` (file=${this.getFileSizeString(fileSize)})` : ''}`,
      );
    }

    return isConfigured;
  }

  /**
   * Check whether Firebase offload upload is available.
   */
  isOffloadUploadAvailable(): boolean {
    return this.isFirebaseConfigured();
  }

  /**
   * Get human-readable file size.
   */
  getFileSizeString(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)}MB`;
  }

  private async postOffloadProcessing(endpoint: string, formData: FormData): Promise<unknown> {
    // Fetch App Check token for request attestation
    const appCheckToken = typeof window !== 'undefined'
      ? await getAppCheckTokenForApi()
      : null;

    const headers: HeadersInit = {};
    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers,
      signal: createSafeTimeoutSignal(800000), // 13+ minutes
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.details || `Backend processing failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Delete an offload URL via the delete endpoint.
   */
  async deleteOffload(offloadUrl: string): Promise<void> {
    if (!offloadUrl) return;

    try {
      // Fetch App Check token for request attestation
      const appCheckToken = typeof window !== 'undefined'
        ? await getAppCheckTokenForApi()
        : null;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
      }

      const response = await fetch('/api/offload/delete', {
        method: 'POST',
        headers,
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

  async detectBeatsFromOffloadUrl(
    offloadUrl: string,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    options: { deleteAfterProcessing?: boolean; audioDuration?: number } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('offload_url', offloadUrl);
      formData.append('detector', detector);
      formData.append('delete_offload', options.deleteAfterProcessing === false ? '0' : '1');
      if (typeof options.audioDuration === 'number' && Number.isFinite(options.audioDuration) && options.audioDuration > 0) {
        formData.append('audio_duration', `${options.audioDuration}`);
      }

      if (detector === 'beat-transformer') {
        formData.append('force', 'true');
      }

      const result = await this.postOffloadProcessing('/api/detect-beats-offload', formData);

      return {
        success: true,
        data: result,
        offloadUrl,
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

  async recognizeChordsFromOffloadUrl(
    offloadUrl: string,
    model: string = 'chord-cnn-lstm',
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('offload_url', offloadUrl);
      formData.append('model', model);
      formData.append('detector', model);
      formData.append('chord_dict', (model === 'btc-sl' || model === 'btc-pl') ? 'large_voca' : 'full');
      formData.append('delete_offload', options.deleteAfterProcessing === false ? '0' : '1');

      const result = await this.postOffloadProcessing('/api/recognize-chords-offload', formData);

      return {
        success: true,
        data: result,
        offloadUrl,
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

  async transcribeSheetSageFromOffloadUrl(
    offloadUrl: string,
    videoId?: string,
    options: { deleteAfterProcessing?: boolean } = {},
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('offload_url', offloadUrl);
      formData.append('delete_offload', options.deleteAfterProcessing === false ? '0' : '1');
      if (videoId) {
        formData.append('videoId', videoId);
      }

      const payload = await this.postOffloadProcessing('/api/transcribe-sheetsage', formData) as {
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
        offloadUrl,
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

  async transcribeSheetSageOffloadUpload(
    audioFile: File,
    videoId?: string,
    onProgress?: (percent: number) => void,
  ): Promise<OffloadUploadResult> {
    const startTime = Date.now();

    try {
      if (onProgress) onProgress(10);
      const offloadUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(35);

      const result = await this.transcribeSheetSageFromOffloadUrl(offloadUrl, videoId, {
        deleteAfterProcessing: true,
      });

      if (onProgress) onProgress(100);

      return {
        ...result,
        offloadUrl,
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
   * Detect beats using the browser offload pipeline.
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
      const offloadUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send offload URL to Python backend for processing
      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.detectBeatsFromOffloadUrl(offloadUrl, detector, {
        deleteAfterProcessing: true,
      });

      const processingTime = Date.now() - startTime;

      if (onProgress) onProgress(100);

      return {
        ...result,
        offloadUrl,
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
   * Recognize chords using the browser offload pipeline.
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
      const offloadUrl = await this.uploadToOffload(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send offload URL to Python backend for processing
      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.recognizeChordsFromOffloadUrl(offloadUrl, model, {
        deleteAfterProcessing: true,
      });

      const processingTime = Date.now() - startTime;

      if (onProgress) onProgress(100);

      return {
        ...result,
        offloadUrl,
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
   * Process audio file with environment-based routing.
   * - Localhost development: direct Python backend multipart
   * - Production browser clients: universal offload upload
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

    // Universal production offload; local development keeps direct multipart.
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
