/**
 * Chord Recognition Service (Facade)
 *
 * Backward-compatible exports that delegate to the new audioAnalysisService.
 * Keeps existing function names and types to avoid breaking imports.
 */

import type { AnalysisResult, ChordDetectorType } from '@/types/audioAnalysis';
import { analyzeAudioWithRateLimit as analyzeAudioWithRateLimitService, analyzeAudio as analyzeAudioService } from '@/services/audioAnalysisService';

// Re-export centralized types for backward compatibility
export type { AnalysisResult, ChordDetectorType, ChordDetectionResult } from '@/types/audioAnalysis';

export async function analyzeAudioWithRateLimit(
  audioInput: File | AudioBuffer | string,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  chordDetector: ChordDetectorType = 'chord-cnn-lstm'
): Promise<AnalysisResult> {
  return analyzeAudioWithRateLimitService(audioInput, beatDetector, chordDetector);
}

export async function analyzeAudio(
  audioInput: AudioBuffer | string,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  chordDetector: ChordDetectorType = 'chord-cnn-lstm'
): Promise<AnalysisResult> {
  return analyzeAudioService(audioInput, beatDetector, chordDetector);
}

