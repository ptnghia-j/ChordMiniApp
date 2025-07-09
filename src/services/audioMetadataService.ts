/**
 * Audio Metadata Service
 * 
 * Provides accurate audio duration and metadata extraction from audio files
 * using the music-metadata library for reliable MP3/audio file analysis.
 */

import { parseBuffer } from 'music-metadata';

export interface AudioMetadata {
  duration: number; // Duration in seconds
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  title?: string;
  artist?: string;
  album?: string;
}

export class AudioMetadataService {
  private static instance: AudioMetadataService;

  public static getInstance(): AudioMetadataService {
    if (!AudioMetadataService.instance) {
      AudioMetadataService.instance = new AudioMetadataService();
    }
    return AudioMetadataService.instance;
  }

  /**
   * Extract audio metadata from a URL by downloading and analyzing the file
   */
  async extractMetadataFromUrl(audioUrl: string): Promise<AudioMetadata | null> {
    try {
      console.log(`🎵 Extracting audio metadata from: ${audioUrl}`);

      // Download the audio file
      const response = await fetch(audioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'audio/*',
          'User-Agent': 'ChordMini/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download audio file: ${response.status} ${response.statusText}`);
      }

      // Get the audio data as buffer
      const audioBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(audioBuffer);



      // Parse metadata using music-metadata
      const metadata = await parseBuffer(buffer);

      const result: AudioMetadata = {
        duration: metadata.format.duration || 0,
        format: metadata.format.container,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        channels: metadata.format.numberOfChannels,
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album
      };



      return result;

    } catch (error) {
      console.error('❌ Failed to extract audio metadata:', error);
      return null;
    }
  }

  /**
   * Extract metadata from a partial download (first few MB) for faster processing
   */
  async extractMetadataFromPartialDownload(audioUrl: string, maxBytes: number = 2 * 1024 * 1024): Promise<AudioMetadata | null> {
    try {


      // Download only the first part of the file
      const response = await fetch(audioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'audio/*',
          'Range': `bytes=0-${maxBytes - 1}`,
          'User-Agent': 'ChordMini/1.0'
        }
      });

      if (!response.ok && response.status !== 206) {
        // If range requests are not supported, fall back to full download
        console.log('⚠️ Range requests not supported, falling back to full download');
        return await this.extractMetadataFromUrl(audioUrl);
      }

      // Get the partial audio data as buffer
      const audioBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(audioBuffer);



      // Parse metadata using music-metadata
      const metadata = await parseBuffer(buffer);

      const result: AudioMetadata = {
        duration: metadata.format.duration || 0,
        format: metadata.format.container,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        channels: metadata.format.numberOfChannels,
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album
      };



      return result;

    } catch (error) {
      console.error('❌ Failed to extract audio metadata from partial download:', error);
      // Fall back to full download if partial fails

      return await this.extractMetadataFromUrl(audioUrl);
    }
  }

  /**
   * Format duration in seconds to MM:SS format
   */
  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Estimate duration from file size (fallback method, less accurate)
   */
  estimateDurationFromFileSize(fileSizeBytes: number, bitrate: number = 128): number {
    if (!fileSizeBytes || fileSizeBytes <= 0) return 0;
    
    // Estimate duration based on file size and bitrate
    // Formula: duration = (file_size_bytes * 8) / (bitrate_kbps * 1000)
    const estimatedDuration = (fileSizeBytes * 8) / (bitrate * 1000);
    
    console.log(`📊 Estimated duration from file size: ${estimatedDuration}s (${this.formatDuration(estimatedDuration)})`);
    
    return estimatedDuration;
  }

  /**
   * Validate if a duration seems reasonable for a music track
   */
  isReasonableDuration(duration: number): boolean {
    // Most music tracks are between 30 seconds and 20 minutes
    return duration >= 30 && duration <= 1200;
  }
}

// Export singleton instance
export const audioMetadataService = AudioMetadataService.getInstance();
