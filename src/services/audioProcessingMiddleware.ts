/**
 * Audio Processing Middleware
 * Orchestrates the complete pipeline: downr.org → Opus/WebM download → MP3 conversion → backend processing
 */

import { audioConversionService } from './audioConversionService';
import { downrAudioService } from './downrAudioService';
import { performanceTracker } from './performanceTracker';
import { recognizeChordsWithRateLimit } from './chordService';
import { detectBeatsWithRateLimit, type BeatDetectionResult } from './beatDetectionService';
import type { ChordDetectorType, ChordDetectionResult } from '@/types/audioAnalysis';

export interface MiddlewareOptions {
  chordDetector?: ChordDetectorType;
  beatDetector?: 'auto' | 'madmom' | 'beat-transformer';
  enablePerformanceTracking?: boolean;
  onProgress?: (step: string, progress: number) => void;
  onStepComplete?: (step: string, duration: number) => void;
}

export interface ProcessingResult {
  success: boolean;
  sessionId?: string;
  chords?: ChordDetectionResult[];
  beats?: BeatDetectionResult;
  audioFile?: File;
  metadata?: {
    title: string;
    duration: number;
    originalFormat: string;
    convertedFormat: string;
    originalSize: number;
    convertedSize: number;
    compressionRatio: number;
  };
  timings?: {
    extraction?: number;
    download?: number;
    conversion?: number;
    chordRecognition?: number;
    beatDetection?: number;
    total: number;
  };
  error?: string;
}

export class AudioProcessingMiddleware {
  /**
   * Process YouTube video through downr.org + conversion pipeline
   */
  async processYouTubeVideo(
    youtubeUrl: string,
    options: MiddlewareOptions = {}
  ): Promise<ProcessingResult> {
    const {
      chordDetector = 'chord-cnn-lstm',
      beatDetector = 'beat-transformer',
      enablePerformanceTracking = true,
      onProgress,
      onStepComplete
    } = options;

    let sessionId: string | undefined;
    
    try {
      // Start performance tracking
      if (enablePerformanceTracking) {
        sessionId = performanceTracker.startSession('downr-conversion', {
          youtubeUrl,
          chordDetector,
          beatDetector
        });
      }

      const result: ProcessingResult = { success: false };
      const timings = {
        extraction: 0,
        download: 0,
        conversion: 0,
        chordRecognition: 0,
        beatDetection: 0,
        total: 0
      };

      // Step 1: Extract audio URL from downr.org
      onProgress?.('Extracting audio URL', 0);
      if (sessionId) performanceTracker.startStep(sessionId, 'audio-extraction');
      
      const extractionResult = await downrAudioService.extractAudioUrl(youtubeUrl);
      timings.extraction = extractionResult.extractionTime;
      
      if (sessionId) {
        performanceTracker.endStep(sessionId, 'audio-extraction', extractionResult.success, extractionResult.error);
      }
      onStepComplete?.('audio-extraction', extractionResult.extractionTime);

      if (!extractionResult.success || !extractionResult.audioUrl) {
        throw new Error(extractionResult.error || 'Failed to extract audio URL');
      }

      onProgress?.('Downloading audio', 20);

      // Step 2: Download audio file
      if (sessionId) performanceTracker.startStep(sessionId, 'audio-download');
      
      const downloadResult = await downrAudioService.downloadAudio(extractionResult.audioUrl);
      timings.download = downloadResult.downloadTime;
      
      if (sessionId) {
        performanceTracker.endStep(sessionId, 'audio-download', downloadResult.success, downloadResult.error);
      }
      onStepComplete?.('audio-download', downloadResult.downloadTime);

      if (!downloadResult.success || !downloadResult.buffer) {
        throw new Error(downloadResult.error || 'Failed to download audio');
      }

      onProgress?.('Converting to MP3', 40);

      // Step 3: Convert Opus/WebM to MP3
      if (sessionId) performanceTracker.startStep(sessionId, 'audio-conversion');

      const conversionResult = await audioConversionService.convertToMP3(
        downloadResult.buffer,
        (progress) => onProgress?.('Converting to MP3', 40 + (progress * 0.3))
      );
      timings.conversion = conversionResult.conversionTime;
      
      if (sessionId) {
        performanceTracker.endStep(sessionId, 'audio-conversion', conversionResult.success, conversionResult.error);
      }
      onStepComplete?.('audio-conversion', conversionResult.conversionTime);

      if (!conversionResult.success || !conversionResult.outputFile) {
        throw new Error(conversionResult.error || 'Failed to convert audio');
      }

      onProgress?.('Processing chords', 70);

      // Step 4: Chord recognition
      let chords: ChordDetectionResult[] | undefined;
      if (sessionId) performanceTracker.startStep(sessionId, 'chord-recognition');
      
      try {
        const chordStartTime = performance.now();
        chords = await recognizeChordsWithRateLimit(conversionResult.outputFile, chordDetector);
        timings.chordRecognition = performance.now() - chordStartTime;
        
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'chord-recognition', true, undefined, {
            chordCount: chords.length
          });
        }
        onStepComplete?.('chord-recognition', timings.chordRecognition);
      } catch (error) {
        const chordError = error instanceof Error ? error.message : 'Chord recognition failed';
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'chord-recognition', false, chordError);
        }
        console.warn('⚠️ Chord recognition failed:', chordError);
      }

      onProgress?.('Processing beats', 85);

      // Step 5: Beat detection
      let beats: BeatDetectionResult | undefined;
      if (sessionId) performanceTracker.startStep(sessionId, 'beat-detection');
      
      try {
        const beatStartTime = performance.now();
        beats = await detectBeatsWithRateLimit(conversionResult.outputFile, beatDetector);
        timings.beatDetection = performance.now() - beatStartTime;
        
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'beat-detection', true, undefined, {
            beatCount: beats.beats?.length || 0,
            bpm: beats.bpm
          });
        }
        onStepComplete?.('beat-detection', timings.beatDetection);
      } catch (error) {
        const beatError = error instanceof Error ? error.message : 'Beat detection failed';
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'beat-detection', false, beatError);
        }
        console.warn('⚠️ Beat detection failed:', beatError);
      }

      onProgress?.('Complete', 100);

      // Calculate total time
      timings.total = timings.extraction + timings.download + timings.conversion + (timings.chordRecognition || 0) + (timings.beatDetection || 0);

      // Build result
      result.success = true;
      result.sessionId = sessionId;
      result.chords = chords;
      result.beats = beats;
      result.audioFile = conversionResult.outputFile;
      result.timings = timings;
      result.metadata = {
        title: extractionResult.title || 'Unknown',
        duration: extractionResult.duration || 0,
        originalFormat: extractionResult.selectedFormat?.ext || 'opus',
        convertedFormat: 'mp3',
        originalSize: conversionResult.inputSize,
        convertedSize: conversionResult.outputSize || 0,
        compressionRatio: conversionResult.compressionRatio || 1
      };

      // End performance tracking
      if (sessionId) {
        performanceTracker.endSession(sessionId, true, undefined, {
          totalSteps: 5,
          successfulSteps: [chords, beats].filter(Boolean).length + 3, // extraction, download, conversion always succeed if we get here
          chordCount: chords?.length || 0,
          beatCount: beats?.beats?.length || 0
        });
      }

      console.log('🎉 Audio processing completed successfully');
      console.log(`   Total time: ${timings.total.toFixed(2)}ms`);
      console.log(`   Chords detected: ${chords?.length || 0}`);
      console.log(`   Beats detected: ${beats?.beats?.length || 0}`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      
      if (sessionId) {
        performanceTracker.endSession(sessionId, false, errorMessage);
      }

      console.error('❌ Audio processing failed:', errorMessage);

      return {
        success: false,
        sessionId,
        error: errorMessage
      };
    }
  }

  /**
   * Process audio file directly (for comparison with existing pipeline)
   */
  async processAudioFile(
    audioFile: File,
    options: MiddlewareOptions = {}
  ): Promise<ProcessingResult> {
    const {
      chordDetector = 'chord-cnn-lstm',
      beatDetector = 'beat-transformer',
      enablePerformanceTracking = true,
      onProgress,
      onStepComplete
    } = options;

    let sessionId: string | undefined;

    try {
      // Start performance tracking
      if (enablePerformanceTracking) {
        sessionId = performanceTracker.startSession('appwrite', {
          fileName: audioFile.name,
          fileSize: audioFile.size,
          chordDetector,
          beatDetector
        });
      }

      const result: ProcessingResult = { success: false };
      const timings = {
        chordRecognition: 0,
        beatDetection: 0,
        total: 0
      };

      onProgress?.('Processing chords', 20);

      // Step 1: Chord recognition
      let chords: ChordDetectionResult[] | undefined;
      if (sessionId) performanceTracker.startStep(sessionId, 'chord-recognition');
      
      try {
        const chordStartTime = performance.now();
        chords = await recognizeChordsWithRateLimit(audioFile, chordDetector);
        timings.chordRecognition = performance.now() - chordStartTime;
        
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'chord-recognition', true, undefined, {
            chordCount: chords.length
          });
        }
        onStepComplete?.('chord-recognition', timings.chordRecognition);
      } catch (error) {
        const chordError = error instanceof Error ? error.message : 'Chord recognition failed';
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'chord-recognition', false, chordError);
        }
        throw error;
      }

      onProgress?.('Processing beats', 60);

      // Step 2: Beat detection
      let beats: BeatDetectionResult | undefined;
      if (sessionId) performanceTracker.startStep(sessionId, 'beat-detection');
      
      try {
        const beatStartTime = performance.now();
        beats = await detectBeatsWithRateLimit(audioFile, beatDetector);
        timings.beatDetection = performance.now() - beatStartTime;
        
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'beat-detection', true, undefined, {
            beatCount: beats.beats?.length || 0,
            bpm: beats.bpm
          });
        }
        onStepComplete?.('beat-detection', timings.beatDetection);
      } catch (error) {
        const beatError = error instanceof Error ? error.message : 'Beat detection failed';
        if (sessionId) {
          performanceTracker.endStep(sessionId, 'beat-detection', false, beatError);
        }
        throw error;
      }

      onProgress?.('Complete', 100);

      // Calculate total time
      timings.total = (timings.chordRecognition || 0) + (timings.beatDetection || 0);

      // Build result
      result.success = true;
      result.sessionId = sessionId;
      result.chords = chords;
      result.beats = beats;
      result.audioFile = audioFile;
      result.timings = timings;

      // End performance tracking
      if (sessionId) {
        performanceTracker.endSession(sessionId, true, undefined, {
          totalSteps: 2,
          successfulSteps: 2,
          chordCount: chords?.length || 0,
          beatCount: beats?.beats?.length || 0
        });
      }

      console.log('🎉 Direct audio processing completed successfully');
      console.log(`   Total time: ${timings.total.toFixed(2)}ms`);
      console.log(`   Chords detected: ${chords?.length || 0}`);
      console.log(`   Beats detected: ${beats?.beats?.length || 0}`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      
      if (sessionId) {
        performanceTracker.endSession(sessionId, false, errorMessage);
      }

      console.error('❌ Direct audio processing failed:', errorMessage);

      return {
        success: false,
        sessionId,
        error: errorMessage
      };
    }
  }

  /**
   * Preload FFmpeg for better user experience
   */
  async preloadFFmpeg(): Promise<void> {
    console.log('🚀 Preloading FFmpeg for audio conversion...');
    await audioConversionService.preload();
  }

  /**
   * Check if all services are ready
   */
  async checkServiceHealth(): Promise<{
    ffmpegReady: boolean;
    downrAvailable: boolean;
    overallReady: boolean;
  }> {
    const ffmpegStatus = audioConversionService.getLoadingStatus();
    const downrHealth = await downrAudioService.checkServiceHealth();

    return {
      ffmpegReady: ffmpegStatus.isLoaded,
      downrAvailable: downrHealth.available,
      overallReady: ffmpegStatus.isLoaded && downrHealth.available
    };
  }
}

// Global instance
export const audioProcessingMiddleware = new AudioProcessingMiddleware();
