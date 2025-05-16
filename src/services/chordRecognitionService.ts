/**
 * Chord Recognition Service
 *
 * This service processes audio data and recognizes chords using signal processing techniques.
 * It would integrate with a machine learning model in a production environment.
 */

import { AUDIO_PROCESSING_CONFIG, NOTES, SUPPORTED_CHORD_TYPES } from '@/config/audioConfig';
import {
  detectBeatsFromFile,
  BeatDetectionResult,
  BeatInfo,
  BeatPosition,
  DownbeatInfo
} from './beatDetectionService';

// Interface for chord detection results
export interface ChordDetectionResult {
  chord: string;       // The detected chord (e.g., "C", "Am")
  start: number;       // Start time in seconds
  end: number;         // End time in seconds
  confidence: number;  // Confidence score (0-1)
}

// Renamed from original BeatDetectionResult to avoid conflict with imported interface
export interface BeatDetectionInfo {
  beats: BeatInfo[];
  downbeats?: number[]; // Added downbeats support
}

export interface AnalysisResult {
  chords: ChordDetectionResult[];
  beats: BeatInfo[];
  downbeats?: number[];  // Added downbeats from Beat-Transformer
  downbeats_with_measures?: DownbeatInfo[]; // Downbeats with measure numbers
  beats_with_positions?: BeatPosition[]; // Beat numbers within measures
  synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[];
  beatModel?: string;    // Which model was used for beat detection
}

/**
 * Process audio file and perform chord and beat analysis
 * @param audioBuffer The audio buffer to analyze
 * @param beatDetector Optional detector to use ('auto', 'librosa', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @returns Promise with analysis results (chords and beats)
 */
export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  beatDetector: 'auto' | 'librosa' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto'
): Promise<AnalysisResult> {
  try {
    console.log('Starting audio analysis...');

    // Extract chord information using the AudioBuffer
    const chordResults = await recognizeChords(audioBuffer);
    console.log(`Detected ${chordResults.length} chords`);

    // Convert AudioBuffer to File/Blob for beat detection API
    const audioBlob = await audioBufferToWav(audioBuffer);
    const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });

    // Detect beats using the Python API with specified detector
    const beatResults = await detectBeatsFromFile(audioFile, beatDetector);
    console.log(`Detected ${beatResults.beats.length} beats, BPM: ${beatResults.bpm}`);

    if (beatResults.downbeats && beatResults.downbeats.length > 0) {
      console.log(`Detected ${beatResults.downbeats.length} downbeats using ${beatResults.model || 'unknown'} model`);
    }

    if (beatResults.beats_with_positions && beatResults.beats_with_positions.length > 0) {
      console.log(`Detected beat positions within measures`);
    }

    // Use the detailed beat info with strength values
    const beats = beatResults.beat_info;

    // Create synchronized chords (chords aligned with beats)
    const synchronizedChords = alignChordsToBeats(chordResults, beats, beatResults.beats_with_positions);

    return {
      chords: chordResults,
      beats,
      downbeats: beatResults.downbeats,
      downbeats_with_measures: beatResults.downbeats_with_measures,
      beats_with_positions: beatResults.beats_with_positions,
      synchronizedChords,
      beatModel: beatResults.model
    };
  } catch (error) {
    console.error('Error in audio analysis:', error);
    throw new Error('Failed to analyze audio: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Detect chords in audio buffer
 * This is a mock implementation for testing
 */
async function recognizeChords(audioBuffer: AudioBuffer): Promise<ChordDetectionResult[]> {
  // This is a mock implementation that generates random chord data
  // In a real implementation, this would use a machine learning model or algorithm

  const duration = audioBuffer.duration;

  // For testing, generate a chord every 2 seconds
  const chordDuration = 2.0;
  const numChords = Math.floor(duration / chordDuration);

  // Chord options (simplified)
  const chords = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'D', 'A', 'Bm', 'E'];

  const results: ChordDetectionResult[] = [];

  for (let i = 0; i < numChords; i++) {
    const start = i * chordDuration;
    const end = (i + 1) * chordDuration;

    // Randomly select a chord
    const chordIndex = Math.floor(Math.random() * chords.length);

    results.push({
      chord: chords[chordIndex],
      start,
      end,
      confidence: 0.7 + 0.3 * Math.random() // Random confidence between 0.7 and 1.0
    });
  }

  return results;
}

/**
 * Align chords to beat positions
 */
function alignChordsToBeats(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  beatsWithPositions?: BeatPosition[]
): {chord: string, beatIndex: number, beatNum?: number}[] {
  const results: {chord: string, beatIndex: number, beatNum?: number}[] = [];

  // Create a map of beat times to beat numbers (if available)
  const beatNumMap = new Map<number, number>();
  if (beatsWithPositions) {
    beatsWithPositions.forEach(beat => {
      beatNumMap.set(beat.time, beat.beatNum);
    });
  }

  // For each beat, find the chord that contains it
  beats.forEach((beat, beatIndex) => {
    const chord = chords.find(c => beat.time >= c.start && beat.time < c.end);

    // Get the beat number from the map or from the beat itself
    const beatNum = beatNumMap.get(beat.time) || beat.beatNum;

    if (chord) {
      results.push({
        chord: chord.chord,
        beatIndex,
        beatNum
      });
    } else {
      // If no chord found, use "N/C" (No Chord)
      results.push({
        chord: 'N/C',
        beatIndex,
        beatNum
      });
    }
  });

  return results;
}

/**
 * Convert AudioBuffer to WAV format
 * This is needed to send the audio data to the Python API
 */
async function audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
  const numOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1size
  view.setUint16(20, 1, true); // audio format (1 for PCM)
  view.setUint16(22, numOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write audio data
  let writeOffset = 44;
  const channelData = [];
  let sample = 0;

  // Extract channel data
  for (let i = 0; i < numOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  // Interleave channel data and convert to 16-bit PCM
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numOfChannels; channel++) {
      // Scale to 16-bit range (-32768 to 32767)
      sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;

      view.setInt16(writeOffset, sample, true);
      writeOffset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Helper function to write a string to a DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}