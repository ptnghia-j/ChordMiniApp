/**
 * Audio Conversion Service
 * Handles client-side audio format conversion using FFmpeg.wasm
 * Converts Opus/WebM audio files to MP3 format for backend compatibility
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export interface ConversionOptions {
  outputFormat: 'mp3' | 'wav';
  bitrate?: string; // e.g., '128k', '192k', '320k'
  sampleRate?: number; // e.g., 44100, 48000
  channels?: number; // 1 for mono, 2 for stereo
  onProgress?: (progress: number) => void;
}

export interface ConversionResult {
  success: boolean;
  outputFile?: File;
  error?: string;
  inputSize: number;
  outputSize?: number;
  conversionTime: number;
  compressionRatio?: number;
}

export class AudioConversionService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Initialize FFmpeg.wasm
   */
  private async initializeFFmpeg(): Promise<void> {
    if (this.isLoaded) return;
    
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }
    
    this.isLoading = true;
    
    this.loadPromise = (async () => {
      try {
        console.log('🔧 Initializing FFmpeg.wasm...');
        
        this.ffmpeg = new FFmpeg();
        
        // Set up logging
        this.ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg:', message);
        });
        
        // Load FFmpeg with CDN URLs for better performance
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        this.isLoaded = true;
        this.isLoading = false;
        console.log('✅ FFmpeg.wasm initialized successfully');
        
      } catch (error) {
        this.isLoading = false;
        console.error('❌ Failed to initialize FFmpeg.wasm:', error);
        throw new Error(`FFmpeg initialization failed: ${error}`);
      }
    })();
    
    return this.loadPromise;
  }

  /**
   * Convert audio file from one format to another
   */
  async convertAudio(
    inputFile: File | ArrayBuffer | Uint8Array,
    options: ConversionOptions = { outputFormat: 'mp3' }
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    
    try {
      // Initialize FFmpeg if not already loaded
      await this.initializeFFmpeg();
      
      if (!this.ffmpeg) {
        throw new Error('FFmpeg not initialized');
      }
      
      console.log('🎵 Starting audio conversion...');
      
      // Prepare input data
      let inputData: Uint8Array;
      let inputSize: number;
      let inputFileName: string;
      
      if (inputFile instanceof File) {
        inputData = new Uint8Array(await inputFile.arrayBuffer());
        inputSize = inputFile.size;
        inputFileName = inputFile.name || 'input.m4a';
      } else if (inputFile instanceof ArrayBuffer) {
        inputData = new Uint8Array(inputFile);
        inputSize = inputFile.byteLength;
        inputFileName = 'input.m4a';
      } else {
        inputData = inputFile;
        inputSize = inputFile.length;
        inputFileName = 'input.m4a';
      }
      
      // Determine file extensions
      const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'm4a';
      const outputExt = options.outputFormat;
      const outputFileName = `output.${outputExt}`;
      
      console.log(`📁 Converting ${inputExt.toUpperCase()} to ${outputExt.toUpperCase()} (${(inputSize / 1024 / 1024).toFixed(2)}MB)`);
      
      // Write input file to FFmpeg filesystem
      await this.ffmpeg.writeFile(inputFileName, inputData);
      
      // Build FFmpeg command
      const command = this.buildFFmpegCommand(inputFileName, outputFileName, options);
      console.log('🔧 FFmpeg command:', command.join(' '));
      
      // Set up progress tracking
      let lastProgress = 0;
      this.ffmpeg.on('progress', ({ progress }) => {
        const currentProgress = Math.round(progress * 100);
        if (currentProgress > lastProgress) {
          lastProgress = currentProgress;
          console.log(`⏳ Conversion progress: ${currentProgress}%`);
          options.onProgress?.(currentProgress);
        }
      });
      
      // Execute conversion
      await this.ffmpeg.exec(command);
      
      // Read output file
      const outputData = await this.ffmpeg.readFile(outputFileName);
      const outputSize = outputData.length;
      
      // Create output File object
      const outputBlob = new Blob([outputData], { 
        type: outputExt === 'mp3' ? 'audio/mpeg' : 'audio/wav' 
      });
      const outputFile = new File([outputBlob], outputFileName, { 
        type: outputBlob.type 
      });
      
      // Cleanup FFmpeg filesystem
      await this.ffmpeg.deleteFile(inputFileName);
      await this.ffmpeg.deleteFile(outputFileName);
      
      const conversionTime = performance.now() - startTime;
      const compressionRatio = inputSize / outputSize;
      
      console.log(`✅ Conversion completed successfully`);
      console.log(`   Input size: ${(inputSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Output size: ${(outputSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Compression ratio: ${compressionRatio.toFixed(2)}x`);
      console.log(`   Conversion time: ${conversionTime.toFixed(2)}ms`);
      
      return {
        success: true,
        outputFile,
        inputSize,
        outputSize,
        conversionTime,
        compressionRatio
      };
      
    } catch (error) {
      const conversionTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
      
      console.error('❌ Audio conversion failed:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        inputSize: inputFile instanceof File ? inputFile.size : 
                  inputFile instanceof ArrayBuffer ? inputFile.byteLength : 
                  inputFile.length,
        conversionTime
      };
    }
  }

  /**
   * Build FFmpeg command based on options
   */
  private buildFFmpegCommand(inputFile: string, outputFile: string, options: ConversionOptions): string[] {
    const command = ['-i', inputFile];
    
    // Audio codec
    if (options.outputFormat === 'mp3') {
      command.push('-c:a', 'libmp3lame');
    } else if (options.outputFormat === 'wav') {
      command.push('-c:a', 'pcm_s16le');
    }
    
    // Bitrate
    if (options.bitrate) {
      command.push('-b:a', options.bitrate);
    } else if (options.outputFormat === 'mp3') {
      command.push('-b:a', '192k'); // Default MP3 bitrate
    }
    
    // Sample rate
    if (options.sampleRate) {
      command.push('-ar', options.sampleRate.toString());
    }
    
    // Channels
    if (options.channels) {
      command.push('-ac', options.channels.toString());
    }
    
    // Output file
    command.push(outputFile);
    
    return command;
  }

  /**
   * Convert Opus/WebM to MP3 with optimized settings for ChordMiniApp
   * Also supports M4A and other formats as fallback
   */
  async convertToMP3(
    inputFile: File | ArrayBuffer | Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    return this.convertAudio(inputFile, {
      outputFormat: 'mp3',
      bitrate: '192k', // Good balance of quality and size
      sampleRate: 44100, // Standard sample rate
      channels: 2, // Stereo
      onProgress
    });
  }

  /**
   * Backward compatibility method for M4A conversion
   * @deprecated Use convertToMP3 instead
   */
  async convertM4AToMP3(
    inputFile: File | ArrayBuffer | Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<ConversionResult> {
    console.warn('⚠️ convertM4AToMP3 is deprecated. Use convertToMP3 instead.');
    return this.convertToMP3(inputFile, onProgress);
  }

  /**
   * Check if FFmpeg is ready
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get FFmpeg loading status
   */
  getLoadingStatus(): { isLoaded: boolean; isLoading: boolean } {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading
    };
  }

  /**
   * Preload FFmpeg for better user experience
   */
  async preload(): Promise<void> {
    if (!this.isLoaded && !this.isLoading) {
      console.log('🚀 Preloading FFmpeg.wasm...');
      await this.initializeFFmpeg();
    }
  }

  /**
   * Estimate conversion time based on file size
   */
  estimateConversionTime(fileSizeBytes: number): number {
    // Rough estimation: ~1 second per MB on average hardware
    const fileSizeMB = fileSizeBytes / 1024 / 1024;
    return Math.max(1000, fileSizeMB * 1000); // Minimum 1 second
  }

  /**
   * Get supported input formats
   */
  getSupportedInputFormats(): string[] {
    return ['m4a', 'aac', 'mp4', 'wav', 'flac', 'ogg', 'webm'];
  }

  /**
   * Get supported output formats
   */
  getSupportedOutputFormats(): string[] {
    return ['mp3', 'wav'];
  }
}

// Global instance
export const audioConversionService = new AudioConversionService();
