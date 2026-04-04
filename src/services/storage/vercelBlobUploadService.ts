/**
 * Vercel Blob Upload Service - Official Vercel Solution for Bypassing 4.5MB Limit
 *
 * This service implements Vercel's official recommended approach for bypassing the 4.5MB
 * request body size limit using Vercel Blob storage.
 *
 * Store Reference: https://vercel.com/nghias-projects/chord-mini-app/stores/blob/store_TRGSq1xmFVErVvno/browser
 * SDK Documentation: https://vercel.com/docs/vercel-blob/using-blob-sdk
 * Client Upload Guide: https://vercel.com/docs/vercel-blob/client-upload
 *
 * Architecture:
 * 1. Client uploads large files directly to Vercel Blob storage (store_TRGSq1xmFVErVvno)
 * 2. Blob URL is sent to Python backend for processing
 * 3. Python backend downloads from Vercel Blob and processes the audio
 * 4. Results are returned to the client
 *
 * Environment Handling:
 * - Production: Uses Vercel Blob for file size management
 * - Localhost Development: Bypasses blob upload, sends files directly to Python backend
 */

import { upload } from '@vercel/blob/client';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { isLocalBackend } from '@/utils/backendConfig';

export interface VercelBlobUploadResult {
  success: boolean;
  data?: unknown;
  error?: string;
  blobUrl?: string;
  processingTime?: number;
}

class VercelBlobUploadService {
  // Keep this aligned with Vercel's body size limit usage policy.
  // We switch to Blob before the raw file hits 4.5MB: multipart FormData adds
  // boundaries/headers so a ~4.3MB file can still trigger FUNCTION_PAYLOAD_TOO_LARGE
  // on POST /api/* if we only compared against the full 4.5MB limit.
  private readonly VERCEL_SIZE_LIMIT = 4.5 * 1024 * 1024;
  private readonly MULTIPART_BODY_HEADROOM_BYTES = 512 * 1024;

  /**
   * Check if we're running in localhost development mode
   */
  private isLocalhostDevelopment(): boolean {
    return isLocalBackend();
  }

  /**
   * Check if we're running in server-side context (Node.js/Docker)
   * Vercel Blob client SDK requires browser globals like 'location'
   */
  private isServerSide(): boolean {
    return typeof window === 'undefined';
  }

  /**
   * Check if file should use blob upload based on environment and file size
   * - Localhost development: Never use blob upload (send directly to Python backend)
   * - Server-side (Docker/API routes): Never use blob upload (client SDK requires browser)
   * - Production client-side: Use blob upload when file size is within headroom of
   *   Vercel's ~4.5MB serverless body limit (multipart overhead), if blob is configured
   */
  shouldUseBlobUpload(fileSize: number): boolean {
    // Skip blob upload in localhost development
    if (this.isLocalhostDevelopment()) {

      return false;
    }

    // Skip blob upload in server-side contexts (Docker, API routes)
    // The @vercel/blob/client SDK requires browser globals like 'location'
    if (this.isServerSide()) {
      console.debug('Skipping Vercel Blob upload in server-side context (Docker/API routes)');
      return false;
    }

    // In production, check file size and blob availability
    const sizeThreshold = this.VERCEL_SIZE_LIMIT - this.MULTIPART_BODY_HEADROOM_BYTES;
    const isLargeFile = fileSize > sizeThreshold;
    const isBlobAvailable = this.isBlobConfigured();



    if (isLargeFile && !isBlobAvailable) {
      console.warn(`⚠️ Large file detected but blob upload not available. File: ${this.getFileSizeString(fileSize)}, Limit: ${this.getFileSizeString(this.VERCEL_SIZE_LIMIT)}`);
    }

    return isLargeFile && isBlobAvailable;
  }

  /**
   * Check if Vercel Blob upload is available
   */
  isBlobUploadAvailable(): boolean {
    return this.isBlobConfigured();
  }

  /**
   * Get human-readable file size
   */
  getFileSizeString(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)}MB`;
  }

  /**
   * Check if Vercel Blob is properly configured
   * Store ID: store_TRGSq1xmFVErVvno
   */
  private isBlobConfigured(): boolean {
    // For client-side, we assume blob upload is available since:
    // 1. The @vercel/blob package is installed
    // 2. The /api/blob/upload endpoint exists
    // 3. BLOB_READ_WRITE_TOKEN is configured in Vercel environment
    if (typeof window !== 'undefined') {

      return true;
    }

    // Server-side: Check for the token
    const hasToken = typeof process !== 'undefined' &&
                     process.env &&
                     !!process.env.BLOB_READ_WRITE_TOKEN;


    return hasToken;
  }

  private async postBlobProcessing(endpoint: string, formData: FormData): Promise<unknown> {
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
   * Delete a blob URL via the /api/blob/delete endpoint.
   * Use this when a route is called with delete_blob=0 and cleanup is done explicitly.
   */
  async deleteBlob(blobUrl: string): Promise<void> {
    if (!blobUrl) return;

    try {
      const response = await fetch('/api/blob/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: blobUrl }),
        keepalive: true,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.warn('⚠️ Blob deletion returned non-OK status (non-critical):', response.status, payload);
      }
    } catch (error) {
      console.warn('⚠️ Blob deletion request failed (non-critical):', error);
    }
  }

  /**
   * Upload file to Vercel Blob storage using client upload
   * Uses store_TRGSq1xmFVErVvno for storage
   */
  async uploadToBlob(audioFile: File): Promise<string> {


    try {
      // Generate unique filename with timestamp and original name
      const timestamp = Date.now();
      const sanitizedName = audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `audio/${timestamp}-${sanitizedName}`;



      // Upload directly to Vercel Blob using client upload
      // This uses the configured BLOB_READ_WRITE_TOKEN for store_TRGSq1xmFVErVvno
      const blob = await upload(filename, audioFile, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        multipart: true, // Enable multipart upload for large files
      });



      return blob.url;

    } catch (error) {
      console.error('❌ Vercel Blob upload failed:', error);

      // Provide helpful error message for configuration issues
      if (error instanceof Error) {
        if (error.message.includes('token') || error.message.includes('unauthorized')) {
          throw new Error('Vercel Blob upload failed: Authentication issue. Please ensure BLOB_READ_WRITE_TOKEN is properly configured in Vercel for store_TRGSq1xmFVErVvno.');
        }
        if (error.message.includes('size') || error.message.includes('limit')) {
          throw new Error('Vercel Blob upload failed: File size exceeds blob storage limits.');
        }
      }

      throw new Error(`Vercel Blob upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async detectBeatsFromBlobUrl(
    blobUrl: string,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    options: { deleteAfterProcessing?: boolean } = {}
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', blobUrl);
      formData.append('detector', detector);
      formData.append('delete_blob', options.deleteAfterProcessing === false ? '0' : '1');

      if (detector === 'beat-transformer') {
        formData.append('force', 'true');
      }

      const result = await this.postBlobProcessing('/api/detect-beats-blob', formData);

      return {
        success: true,
        data: result,
        blobUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Blob beat detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async recognizeChordsFromBlobUrl(
    blobUrl: string,
    model: string = 'chord-cnn-lstm',
    options: { deleteAfterProcessing?: boolean } = {}
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', blobUrl);
      formData.append('model', model);
      formData.append('detector', model);
      formData.append('chord_dict', (model === 'btc-sl' || model === 'btc-pl') ? 'large_voca' : 'full');
      formData.append('delete_blob', options.deleteAfterProcessing === false ? '0' : '1');

      const result = await this.postBlobProcessing('/api/recognize-chords-blob', formData);

      return {
        success: true,
        data: result,
        blobUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Blob chord recognition failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async transcribeSheetSageFromBlobUrl(
    blobUrl: string,
    videoId?: string,
    options: { deleteAfterProcessing?: boolean } = {}
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('blob_url', blobUrl);
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
        blobUrl,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Sheet Sage blob transcription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async transcribeSheetSageBlobUpload(
    audioFile: File,
    videoId?: string,
    onProgress?: (percent: number) => void
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToBlob(audioFile);
      if (onProgress) onProgress(35);

      const result = await this.transcribeSheetSageFromBlobUrl(blobUrl, videoId, {
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
   * Detect beats using Vercel Blob upload for large files
   */
  async detectBeatsBlobUpload(
    audioFile: File,
    detector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
    onProgress?: (percent: number) => void
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {


      // Step 1: Upload to Vercel Blob
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToBlob(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send Blob URL to Python backend for processing
      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.detectBeatsFromBlobUrl(blobUrl, detector, {
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
      console.error('❌ Blob beat detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Recognize chords using Vercel Blob upload for large files
   */
  async recognizeChordsBlobUpload(
    audioFile: File,
    model: string = 'chord-cnn-lstm',
    onProgress?: (percent: number) => void
  ): Promise<VercelBlobUploadResult> {
    const startTime = Date.now();

    try {


      // Step 1: Upload to Vercel Blob
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToBlob(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send Blob URL to Python backend for processing

      // deleteAfterProcessing=true keeps cleanup on the server route and avoids duplicate client delete calls.
      const result = await this.recognizeChordsFromBlobUrl(blobUrl, model, {
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
      console.error('❌ Blob chord recognition failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process audio file with automatic routing based on environment and file size
   * - Localhost development: Always use direct Python backend (no blob upload)
   * - Production small files (below size threshold with multipart headroom): standard proxy
   * - Production larger files: Vercel Blob upload
   */
  async processAudioFile(
    audioFile: File,
    operation: 'detect-beats' | 'recognize-chords',
    options: {
      detector?: 'auto' | 'madmom' | 'beat-transformer';
      model?: string;
      onProgress?: (percent: number) => void;
    } = {}
  ): Promise<VercelBlobUploadResult> {
    const { detector = 'beat-transformer', model = 'chord-cnn-lstm', onProgress } = options;

    // Check if we should use blob upload (considers both environment and file size)
    if (this.shouldUseBlobUpload(audioFile.size)) {


      if (operation === 'detect-beats') {
        return this.detectBeatsBlobUpload(audioFile, detector, onProgress);
      } else {
        return this.recognizeChordsBlobUpload(audioFile, model, onProgress);
      }
    } else {
      // Either localhost development or small file in production
      if (this.isLocalhostDevelopment()) {

      } else {

      }

      // Return special result indicating to use the standard flow
      return {
        success: false,
        error: 'USE_STANDARD_FLOW' // Special error code to indicate fallback to standard flow
      };
    }
  }
}

export const vercelBlobUploadService = new VercelBlobUploadService();