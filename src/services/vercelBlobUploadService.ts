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
 */

import { upload } from '@vercel/blob/client';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

export interface VercelBlobUploadResult {
  success: boolean;
  data?: unknown;
  error?: string;
  blobUrl?: string;
  processingTime?: number;
}

class VercelBlobUploadService {
  private readonly PYTHON_BACKEND_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';
  private readonly VERCEL_SIZE_LIMIT = 4.0 * 1024 * 1024; // 4.0MB conservative limit

  /**
   * Check if file should use blob upload (larger than Vercel limit)
   */
  shouldUseBlobUpload(fileSize: number): boolean {
    const isLargeFile = fileSize > this.VERCEL_SIZE_LIMIT;
    const isBlobAvailable = this.isBlobConfigured();

    console.log(`🔍 Blob upload check: fileSize=${this.getFileSizeString(fileSize)}, isLarge=${isLargeFile}, blobAvailable=${isBlobAvailable}, limit=${this.getFileSizeString(this.VERCEL_SIZE_LIMIT)}`);

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
      console.log('🔍 Client-side blob configuration check: Available');
      return true;
    }

    // Server-side: Check for the token
    const hasToken = typeof process !== 'undefined' &&
                     process.env &&
                     !!process.env.BLOB_READ_WRITE_TOKEN;

    console.log(`🔍 Server-side blob configuration check: ${hasToken ? 'Available' : 'Missing token'}`);
    return hasToken;
  }

  /**
   * Upload file to Vercel Blob storage using client upload
   * Uses store_TRGSq1xmFVErVvno for storage
   */
  async uploadToBlob(audioFile: File): Promise<string> {
    console.log(`📤 Uploading file to Vercel Blob (store_TRGSq1xmFVErVvno): ${audioFile.name} (${this.getFileSizeString(audioFile.size)})`);

    try {
      // Generate unique filename with timestamp and original name
      const timestamp = Date.now();
      const sanitizedName = audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `audio/${timestamp}-${sanitizedName}`;

      console.log(`📤 Uploading as: ${filename}`);

      // Upload directly to Vercel Blob using client upload
      // This uses the configured BLOB_READ_WRITE_TOKEN for store_TRGSq1xmFVErVvno
      const blob = await upload(filename, audioFile, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        multipart: true, // Enable multipart upload for large files
      });

      console.log(`✅ File uploaded to Vercel Blob: ${blob.url}`);
      console.log(`📊 Blob details: pathname=${blob.pathname}`);

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
      console.log(`🔄 Vercel Blob upload beat detection for file: ${audioFile.name} (${this.getFileSizeString(audioFile.size)})`);

      // Step 1: Upload to Vercel Blob
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToBlob(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send Blob URL to Python backend for processing
      console.log('🔄 Sending Blob URL to Python backend for beat detection...');
      
      const formData = new FormData();
      formData.append('blob_url', blobUrl);
      formData.append('detector', detector);

      const response = await fetch(`/api/detect-beats-blob`, {
        method: 'POST',
        body: formData,
        signal: createSafeTimeoutSignal(800000) // 13+ minutes
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Backend processing failed: ${response.status}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Blob beat detection completed in ${(processingTime / 1000).toFixed(1)}s`);
      if (onProgress) onProgress(100);

      return {
        success: true,
        data: result,
        blobUrl,
        processingTime
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
      console.log(`🔄 Vercel Blob upload chord recognition for file: ${audioFile.name} (${this.getFileSizeString(audioFile.size)})`);

      // Step 1: Upload to Vercel Blob
      if (onProgress) onProgress(10);
      const blobUrl = await this.uploadToBlob(audioFile);
      if (onProgress) onProgress(30);

      // Step 2: Send Blob URL to Python backend for processing
      console.log('🔄 Sending Blob URL to Python backend for chord recognition...');
      
      const formData = new FormData();
      formData.append('blob_url', blobUrl);
      formData.append('model', model);

      const response = await fetch(`/api/recognize-chords-blob`, {
        method: 'POST',
        body: formData,
        signal: createSafeTimeoutSignal(800000) // 13+ minutes
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Backend processing failed: ${response.status}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Blob chord recognition completed in ${(processingTime / 1000).toFixed(1)}s`);
      if (onProgress) onProgress(100);

      return {
        success: true,
        data: result,
        blobUrl,
        processingTime
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
   * Process audio file with automatic routing based on file size
   * Small files (<4.0MB) use direct Vercel proxy
   * Large files (>4.0MB) use Vercel Blob upload
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
    
    if (this.shouldUseBlobUpload(audioFile.size)) {
      console.log(`🔄 File size ${this.getFileSizeString(audioFile.size)} > 4.0MB, using Vercel Blob upload`);
      
      if (operation === 'detect-beats') {
        return this.detectBeatsBlobUpload(audioFile, detector, onProgress);
      } else {
        return this.recognizeChordsBlobUpload(audioFile, model, onProgress);
      }
    } else {
      console.log(`🔄 File size ${this.getFileSizeString(audioFile.size)} <= 4.0MB, using standard Vercel proxy`);
      
      // For small files, we'll return a special result indicating to use the standard flow
      return {
        success: false,
        error: 'USE_STANDARD_FLOW' // Special error code to indicate fallback to standard flow
      };
    }
  }
}

export const vercelBlobUploadService = new VercelBlobUploadService();
