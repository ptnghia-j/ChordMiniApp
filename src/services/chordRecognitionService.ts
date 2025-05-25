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
    beatShift?: number;     // Beat grid shift applied for optimal chord alignment (-1, 0, or +1)
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

    // Debug: Log the raw beat detection results
    console.log('=== BEAT DETECTION DEBUG ===');
    console.log('Raw beatResults object:', beatResults);
    console.log('beatResults.time_signature:', beatResults.time_signature);
    console.log('beatResults.bpm:', beatResults.bpm);
    console.log('beatResults.model:', beatResults.model);
    console.log('=== END BEAT DETECTION DEBUG ===');

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
    const timeSignature = beatResults.time_signature || 4; // Use detected time signature or default to 4
    const alignmentResult = alignChordsToBeats(chordResults, beats, beatResults.beats_with_positions, timeSignature);

    return {
      chords: chordResults,
      beats,
      downbeats: beatResults.downbeats,
      downbeats_with_measures: beatResults.downbeats_with_measures,
      beats_with_positions: beatResults.beats_with_positions,
      synchronizedChords: alignmentResult.synchronizedChords,
      beatModel: beatResults.model,
      chordModel: chordDetector,
      beatDetectionResult: {
        time_signature: beatResults.time_signature, // Use detected time signature (no hardcoded fallback)
        bpm: beatResults.bpm,
        beatShift: alignmentResult.beatShift // Include the beat shift for synchronization
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
 * Find the optimal beat grid shift by testing minimal offsets
 *
 * This function tests shifting the beat grid by 0 to (timeSignature-1) positions
 * and calculates alignment scores to find the best global offset that maximizes
 * chord alignment with downbeats and strong beats.
 */
function findOptimalBeatShift(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  beatsWithPositions?: BeatPosition[],
  timeSignature: number = 4
): number {
  // Create beat number map for scoring
  const beatNumMap = new Map<number, number>();
  if (beatsWithPositions) {
    beatsWithPositions.forEach(bp => {
      beatNumMap.set(bp.time, bp.beatNum);
    });
  }

  // Test shifts from 0 to (timeSignature - 1) - this covers all possible beat positions
  const testShifts = Array.from({ length: timeSignature }, (_, i) => i);
  let bestShift = 0;
  let bestScore = -Infinity;

  console.log('=== TESTING COMPREHENSIVE BEAT GRID SHIFTS ===');
  console.log(`Time signature: ${timeSignature}/4`);
  console.log(`Total chords: ${chords.length}, Total beats: ${beats.length}`);

  for (const shift of testShifts) {
    const scoreResult = calculateAlignmentScore(chords, beats, shift, beatNumMap, timeSignature);
    console.log(`Shift ${shift}: score = ${scoreResult.totalScore.toFixed(3)} (downbeats: ${scoreResult.downbeatAlignments}, strong beats: ${scoreResult.strongBeatAlignments}, avg distance: ${scoreResult.avgDistance.toFixed(3)})`);

    if (scoreResult.totalScore > bestScore) {
      bestScore = scoreResult.totalScore;
      bestShift = shift;
    }
  }

  console.log(`Best shift: ${bestShift} with score ${bestScore.toFixed(3)}`);
  console.log('=== END COMPREHENSIVE BEAT GRID SHIFT TESTING ===');

  return bestShift;
}

/**
 * Calculate alignment score for a given beat shift
 */
function calculateAlignmentScore(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  shift: number,
  beatNumMap: Map<number, number>,
  timeSignature: number = 4
): {totalScore: number, downbeatAlignments: number, strongBeatAlignments: number, avgDistance: number} {
  let downbeatAlignments = 0;
  let strongBeatAlignments = 0;
  let totalDistance = 0;
  let validAlignments = 0;

  // Apply shift to beat indices (with bounds checking)
  const getShiftedBeatIndex = (originalIndex: number): number => {
    const shiftedIndex = originalIndex + shift;
    return Math.max(0, Math.min(beats.length - 1, shiftedIndex));
  };

  chords.forEach(chord => {
    if (chord.chord === "N") return; // Skip "no chord" entries

    // Find the closest beat to this chord
    let closestBeatIndex = 0;
    let minDistance = Infinity;

    beats.forEach((beat, index) => {
      const distance = Math.abs(chord.start - beat.time);
      if (distance < minDistance) {
        minDistance = distance;
        closestBeatIndex = index;
      }
    });

    // Apply shift to the closest beat index
    const shiftedBeatIndex = getShiftedBeatIndex(closestBeatIndex);
    const shiftedBeat = beats[shiftedBeatIndex];
    const shiftedDistance = Math.abs(chord.start - shiftedBeat.time);

    // Get beat number for the shifted beat
    let beatNum = beatNumMap.get(shiftedBeat.time) || shiftedBeat.beatNum || 1;

    // Try with tolerance if exact match failed
    if (!beatNum && beatNumMap.size > 0) {
      for (const [time, num] of beatNumMap.entries()) {
        if (Math.abs(time - shiftedBeat.time) < 0.01) {
          beatNum = num;
          break;
        }
      }
    }

    // Score this alignment
    if (shiftedDistance <= 0.75) { // Only consider reasonable alignments
      validAlignments++;
      totalDistance += shiftedDistance;

      // Bonus for downbeats (beat number 1)
      if (beatNum === 1) {
        downbeatAlignments++;
      }

      // Bonus for strong beats (time signature aware)
      const isStrongBeat = (() => {
        if (beatNum === 1) return true; // Downbeat is always strong

        switch (timeSignature) {
          case 2: return false; // Only beat 1 is strong in 2/4
          case 3: return false; // Only beat 1 is strong in 3/4
          case 4: return beatNum === 3; // Beats 1 and 3 are strong in 4/4
          case 6: return beatNum === 4; // Beats 1 and 4 are strong in 6/4
          case 8: return beatNum === 3 || beatNum === 5 || beatNum === 7; // Beats 1, 3, 5, 7 in 8/4
          default: return beatNum % 2 === 1; // Odd beats for other time signatures
        }
      })();

      if (isStrongBeat) {
        strongBeatAlignments++;
      }
    }
  });

  const avgDistance = validAlignments > 0 ? totalDistance / validAlignments : 1.0;

  // Calculate total score (higher is better)
  const totalScore = (downbeatAlignments * 3.0) + (strongBeatAlignments * 1.5) - (avgDistance * 2.0);

  return {
    totalScore,
    downbeatAlignments,
    strongBeatAlignments,
    avgDistance
  };
}

/**
 * Align chords to beat positions with global offset optimization
 *
 * This function tests multiple global beat grid shifts to find the optimal alignment
 * that maximizes chord-to-downbeat alignment, then maps chords to beats.
 */
function alignChordsToBeats(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  beatsWithPositions?: BeatPosition[],
  timeSignature: number = 4
): {synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[], beatShift: number} {
  // Initialize results array with one entry per beat
  const results: {chord: string, beatIndex: number, beatNum?: number}[] = [];

  console.log(`Aligning ${chords.length} chords to ${beats.length} beats`);
  console.log('First 3 chords:', chords.slice(0, 3));
  console.log('First 3 beats:', beats.slice(0, 3));

  // Step 1: Test multiple beat grid shifts to find optimal alignment
  const bestShift = findOptimalBeatShift(chords, beats, beatsWithPositions, timeSignature);
  console.log(`Optimal beat shift determined: ${bestShift} positions`);

  // Step 2: Create padded beat grid based on optimal shift
  console.log(`Creating padded beat grid with ${bestShift} padding beats`);

  // Create padding beats at the beginning
  const paddingBeats: BeatInfo[] = [];
  const paddingPositions: BeatPosition[] = [];

  if (bestShift > 0 && beats.length > 0) {
    const firstBeat = beats[0];
    const avgBeatInterval = beats.length > 1 ? (beats[beats.length - 1].time - beats[0].time) / (beats.length - 1) : 0.5;

    for (let i = 0; i < bestShift; i++) {
      const paddingTime = firstBeat.time - (bestShift - i) * avgBeatInterval;
      paddingBeats.push({
        time: paddingTime,
        strength: 0.3, // Lower strength for padding beats
        beatNum: undefined
      });

      // Calculate beat number for padding beat
      const paddingBeatNum = ((timeSignature - (bestShift - i - 1)) % timeSignature) || timeSignature;
      paddingPositions.push({
        time: paddingTime,
        beatNum: paddingBeatNum
      });
    }
  }

  // Combine padding beats with original beats
  const extendedBeats = [...paddingBeats, ...beats];
  const extendedPositions = [...paddingPositions, ...(beatsWithPositions || [])];

  console.log(`Extended beat grid: ${paddingBeats.length} padding + ${beats.length} original = ${extendedBeats.length} total beats`);

  // Create beat number map for the extended grid
  const beatNumMap = new Map<number, number>();
  extendedPositions.forEach(bp => {
    beatNumMap.set(bp.time, bp.beatNum);
  });

  // Step 3: Map chords to the extended beat grid (no shifting needed - padding handles alignment)
  const beatToChordMap = new Map<number, string>();

  // For each chord, find the closest beat in the extended grid
  chords.forEach(chord => {
    if (chord.chord === "N") return; // Skip "no chord" entries

    let closestBeatIndex = 0;
    let minDistance = Infinity;

    extendedBeats.forEach((beat, index) => {
      const distance = Math.abs(chord.start - beat.time);
      if (distance < minDistance) {
        minDistance = distance;
        closestBeatIndex = index;
      }
    });

    const closestBeat = extendedBeats[closestBeatIndex];

    // Get beat number for the closest beat (if available)
    let beatNum = beatNumMap.get(closestBeat.time) || closestBeat.beatNum;

    // Try with tolerance if exact match failed
    if (!beatNum && beatNumMap.size > 0) {
      for (const [time, num] of beatNumMap.entries()) {
        if (Math.abs(time - closestBeat.time) < 0.01) {
          beatNum = num;
          break;
        }
      }
    }

    const chordName = chord.chord === "N" ? "N/C" : chord.chord;

    // Debug: Log chord alignment decisions for first few chords
    if (beatToChordMap.size < 10) {
      const isPadding = closestBeatIndex < paddingBeats.length;
      console.log(`Chord alignment: ${chordName} (start: ${chord.start.toFixed(3)}s) -> Beat ${closestBeatIndex} (time: ${closestBeat.time.toFixed(3)}s, beatNum: ${beatNum}, padding: ${isPadding})`);
    }

    // Store the chord assignment
    beatToChordMap.set(closestBeatIndex, chordName);
  });

  // Step 4: Generate results for the original beat grid (excluding padding)
  // Map from extended beat indices to original beat indices
  extendedBeats.forEach((beat, extendedIndex) => {
    // Skip padding beats - only process original beats
    if (extendedIndex < paddingBeats.length) return;

    const originalBeatIndex = extendedIndex - paddingBeats.length;

    // Get the beat number from the map or from the beat itself
    let beatNum = beatNumMap.get(beat.time) || beat.beatNum;

    // If exact match failed, try with small tolerance (±0.01 seconds)
    if (!beatNum && beatNumMap.size > 0) {
      for (const [time, num] of beatNumMap.entries()) {
        if (Math.abs(time - beat.time) < 0.01) {
          beatNum = num;
          break;
        }
      }
    }

    // Get the chord assigned to this beat in the extended grid, or "N/C" if none
    const chord = beatToChordMap.get(extendedIndex) || 'N/C';

    // Debug: Log beat number mapping for first few beats
    if (originalBeatIndex < 10) {
      console.log(`Original Beat ${originalBeatIndex} (extended ${extendedIndex}): time=${beat.time.toFixed(3)}, beatNum=${beatNum}, chord=${chord}`);
    }

    // Add to results using original beat index
    results.push({
      chord,
      beatIndex: originalBeatIndex,
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

  // Debug: Log beat number pattern from synchronized chords
  console.log('=== SYNCHRONIZED CHORDS BEAT NUMBERS DEBUG ===');
  const beatNumberPattern = results.slice(0, 20).map(r => r.beatNum || 'undefined');
  console.log(`Beat number pattern from synchronizedChords: [${beatNumberPattern.join(', ')}]`);
  console.log('=== END SYNCHRONIZED CHORDS DEBUG ===');

  // Count unique chords
  const uniqueChords = new Set(results.map(r => r.chord).filter(c => c !== 'N/C')).size;
  console.log(`Number of unique chords: ${uniqueChords}`);

  return {
    synchronizedChords: results,
    beatShift: bestShift
  };
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