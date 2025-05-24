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
  chordModel?: string;   // Which model was used for chord detection
  beatDetectionResult?: {
    time_signature?: number; // Time signature (beats per measure)
    bpm?: number;           // Beats per minute
  };
}

/**
 * Process audio file and perform chord and beat analysis
 * @param audioBuffer The audio buffer to analyze
 * @param beatDetector Optional detector to use ('auto', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @param chordDetector Optional chord detector to use ('chord-cnn-lstm')
 * @returns Promise with analysis results (chords and beats)
 */
export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto',
  chordDetector: 'chord-cnn-lstm' = 'chord-cnn-lstm'
): Promise<AnalysisResult> {
  try {
    console.log('Starting audio analysis...');

    // Convert AudioBuffer to File/Blob for API calls
    const audioBlob = await audioBufferToWav(audioBuffer);
    const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });

    // Detect beats using the Python API with specified detector
    console.log(`Detecting beats using ${beatDetector} model...`);
    const beatResults = await detectBeatsFromFile(audioFile, beatDetector);
    console.log(`Detected ${beatResults.beats.length} beats, BPM: ${beatResults.bpm}`);
    console.log(`Detected time signature: ${beatResults.time_signature || 4}/4`);

    if (beatResults.downbeats && beatResults.downbeats.length > 0) {
      console.log(`Detected ${beatResults.downbeats.length} downbeats using ${beatResults.model || 'unknown'} model`);
    }

    if (beatResults.beats_with_positions && beatResults.beats_with_positions.length > 0) {
      console.log(`Detected beat positions within measures`);
    }

    // Use the detailed beat info with strength values
    const beats = beatResults.beat_info;

    // Recognize chords using the Chord-CNN-LSTM model
    console.log(`Recognizing chords using ${chordDetector} model...`);
    const chordResults = await recognizeChords(audioFile, chordDetector);
    console.log(`Detected ${chordResults.length} chords`);

    // Create synchronized chords (chords aligned with beats)
    const synchronizedChords = alignChordsToBeats(chordResults, beats, beatResults.beats_with_positions);

    return {
      chords: chordResults,
      beats,
      downbeats: beatResults.downbeats,
      downbeats_with_measures: beatResults.downbeats_with_measures,
      beats_with_positions: beatResults.beats_with_positions,
      synchronizedChords,
      beatModel: beatResults.model,
      chordModel: chordDetector,
      beatDetectionResult: {
        time_signature: beatResults.time_signature || 4, // Use detected time signature or default to 4/4
        bpm: beatResults.bpm
      }
    };
  } catch (error) {
    console.error('Error in audio analysis:', error);
    throw new Error('Failed to analyze audio: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Detect chords in audio file using the Chord-CNN-LSTM model
 * @param audioFile The audio file to analyze
 * @param model The chord detection model to use ('chord-cnn-lstm')
 * @returns Promise with chord detection results
 */
async function recognizeChords(
  audioFile: File,
  model: 'chord-cnn-lstm' = 'chord-cnn-lstm'
): Promise<ChordDetectionResult[]> {
  try {
    console.log(`Recognizing chords with ${model} model...`);

    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', audioFile);

    // Call the Python backend API
    const response = await fetch('/api/recognize-chords', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(`Chord recognition failed: ${data.error || 'Unknown error'}`);
    }

    console.log(`Received ${data.chords.length} chords from the API`);
    console.log('First 5 chords from API:', data.chords.slice(0, 5));

    // Convert the API response to ChordDetectionResult format
    const chords: ChordDetectionResult[] = data.chords.map((chord: any) => ({
      start: chord.start,
      end: chord.end,
      chord: chord.chord,
      confidence: chord.confidence || 0.9
    }));

    // Sort chords by start time
    chords.sort((a, b) => a.start - b.start);

    console.log('Processed and sorted chords:', chords.slice(0, 5));

    return chords;
  } catch (error) {
    console.error('Error in chord recognition:', error);
    throw new Error('Failed to recognize chords: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Align chords to beat positions
 *
 * This function maps chords to beats by finding the closest beat to each chord's start time,
 * and then ensuring each beat has a chord assigned to it.
 */
function alignChordsToBeats(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  beatsWithPositions?: BeatPosition[]
): {chord: string, beatIndex: number, beatNum?: number}[] {
  // Initialize results array with one entry per beat
  const results: {chord: string, beatIndex: number, beatNum?: number}[] = [];

  console.log(`Aligning ${chords.length} chords to ${beats.length} beats`);
  console.log('First 3 chords:', chords.slice(0, 3));
  console.log('First 3 beats:', beats.slice(0, 3));

  // Create a map of beat times to beat numbers (if available)
  const beatNumMap = new Map<number, number>();
  if (beatsWithPositions) {
    beatsWithPositions.forEach(beat => {
      beatNumMap.set(beat.time, beat.beatNum);
    });
  }

  // Create a map to track which chord should be assigned to each beat
  const beatToChordMap = new Map<number, string>();

  // First pass: For each chord, find the closest beat to its start time
  chords.forEach(chord => {
    // Skip "N" chords (no chord)
    if (chord.chord === "N") return;

    // Find the closest beat to the chord's start time
    let closestBeatIndex = -1;
    let minDistance = Number.MAX_VALUE;

    beats.forEach((beat, index) => {
      // Calculate distance between chord start and beat time
      const distance = Math.abs(chord.start - beat.time);

      // If this beat is closer than the current closest beat, update
      if (distance < minDistance) {
        minDistance = distance;
        closestBeatIndex = index;
      }
    });

    // If we found a closest beat, assign this chord to it
    if (closestBeatIndex !== -1) {
      // Format chord name
      const chordName = chord.chord === "N" ? "N/C" : chord.chord;

      // Store in our map - if there's a conflict, higher confidence wins
      const existingChord = beatToChordMap.get(closestBeatIndex);
      if (!existingChord || chord.confidence > 0.5) {
        beatToChordMap.set(closestBeatIndex, chordName);
      }
    }
  });

  // Second pass: Fill in the results array for each beat
  beats.forEach((beat, beatIndex) => {
    // Get the beat number from the map or from the beat itself
    const beatNum = beatNumMap.get(beat.time) || beat.beatNum;

    // Get the chord assigned to this beat, or "N/C" if none
    const chord = beatToChordMap.get(beatIndex) || 'N/C';

    // Add to results
    results.push({
      chord,
      beatIndex,
      beatNum
    });
  });

  // Third pass: Fill in any gaps with the previous chord
  // This ensures chord continuity between explicit chord changes
  let lastChord = 'N/C';
  for (let i = 0; i < results.length; i++) {
    if (results[i].chord !== 'N/C') {
      lastChord = results[i].chord;
    } else if (lastChord !== 'N/C') {
      results[i].chord = lastChord;
    }
  }

  console.log(`Generated ${results.length} synchronized chords`);
  console.log('First 5 synchronized chords:', results.slice(0, 5));

  // Count unique chords
  const uniqueChords = new Set(results.map(r => r.chord).filter(c => c !== 'N/C')).size;
  console.log(`Number of unique chords: ${uniqueChords}`);

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