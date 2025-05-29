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
  downbeats?: number[];  // Downbeats from Beat-Transformer
  synchronizedChords: {chord: string, beatIndex: number}[];
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

    // FIX 3: Enhanced debug logging for beat detection results
    console.log('=== CHORD RECOGNITION SERVICE - BEAT DETECTION DEBUG ===');
    console.log('Raw beatResults object:', beatResults);
    console.log('beatResults.time_signature:', beatResults.time_signature);
    console.log('beatResults.bpm:', beatResults.bpm);
    console.log('beatResults.model:', beatResults.model);

    // Verify beats_with_positions data integrity
    if (beatResults.beats_with_positions && Array.isArray(beatResults.beats_with_positions)) {
      console.log(`Received ${beatResults.beats_with_positions.length} beats with positions from beat detection service`);
      const beatPattern = beatResults.beats_with_positions.slice(0, 15).map(bp => bp.beatNum);
      console.log(`Beat pattern from beat detection service: [${beatPattern.join(', ')}]`);

      // Check for data integrity issues
      const invalidBeats = beatResults.beats_with_positions.filter(bp => !bp.beatNum || !bp.time);
      if (invalidBeats.length > 0) {
        console.warn(`⚠️  Found ${invalidBeats.length} beats with missing beatNum or time data`);
      }
    } else {
      console.warn('⚠️  No beats_with_positions received from beat detection service');
    }

    console.log('=== END CHORD RECOGNITION SERVICE - BEAT DETECTION DEBUG ===');

    console.log(`Detected ${beatResults.beats.length} beats, BPM: ${beatResults.bpm}`);
    console.log(`Detected time signature: ${beatResults.time_signature || 4}/4`);

    if (beatResults.downbeats && beatResults.downbeats.length > 0) {
      console.log(`Detected ${beatResults.downbeats.length} downbeats using ${beatResults.model || 'unknown'} model`);
    }

    if (beatResults.beats_with_positions && beatResults.beats_with_positions.length > 0) {
      console.log(`Detected beat positions within measures`);
    }

    // Convert pure model beat timestamps to BeatInfo format
    const beats: BeatInfo[] = beatResults.beats.map((time: number, index: number) => ({
      time,
      strength: 0.8, // Default strength since backend no longer provides this
      beatNum: (index % (beatResults.time_signature || 4)) + 1
    }));

    // Recognize chords using the Chord-CNN-LSTM model
    console.log(`Recognizing chords using ${chordDetector} model...`);
    const chordResults = await recognizeChords(audioFile, chordDetector);
    console.log(`Detected ${chordResults.length} chords`);

    // Create synchronized chords using pure model outputs
    // REMOVED: No timing offset calculation needed
    const synchronizedChords = synchronizeChords(chordResults, beats);

    // Debug: Log the beat detection result before creating the final analysis result
    console.log('=== CHORD RECOGNITION SERVICE DEBUG ===');
    console.log('beatResults.time_signature:', beatResults.time_signature);
    console.log('beatResults.time_signature type:', typeof beatResults.time_signature);
    console.log('beatResults.bpm:', beatResults.bpm);
    console.log('beatResults.model:', beatResults.model);
    console.log('=== END CHORD RECOGNITION SERVICE DEBUG ===');

    return {
      chords: chordResults,
      beats,
      downbeats: beatResults.downbeats,
      synchronizedChords: synchronizedChords,
      beatModel: beatResults.model,
      chordModel: chordDetector,
      beatDetectionResult: {
        time_signature: beatResults.time_signature,
        bpm: beatResults.bpm,
        beat_time_range_start: beatResults.beat_time_range_start,
        beat_time_range_end: beatResults.beat_time_range_end
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

// Removed frontend padding function - using pure model outputs only

/**
 * Improved chord-to-beat alignment with musical context awareness
 */
function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
): {chord: string, beatIndex: number}[] {
  console.log(`=== IMPROVED CHORD-TO-BEAT ALIGNMENT ===`);
  console.log(`Aligning ${chords.length} chords to ${beats.length} beats using musical context-aware matching`);

  if (chords.length === 0 || beats.length === 0) {
    console.log('No chords or beats to align');
    return [];
  }

  // REMOVED: Timing offset calculation - no longer needed
  console.log(`🕐 DIRECT CHORD-TO-BEAT ALIGNMENT (no timing offset):`);
  console.log(`  Using direct model outputs without timing adjustments`);

  // Create a map of chord assignments to beats
  const beatToChordMap = new Map<number, string>();

  // For each chord, find the best beat using musical context-aware scoring
  for (const chord of chords) {
    const chordName = chord.chord === "N" ? "N/C" : chord.chord;

    // REMOVED: No timing offset applied - use direct chord times
    const chordStart = chord.start;
    const chordEnd = chord.end;

    let bestBeatIndex = 0;
    let bestScore = Infinity;

    console.log(`\n🎵 Aligning chord "${chordName}"`);
    console.log(`  Direct timing: start=${chordStart.toFixed(3)}s, end=${chordEnd.toFixed(3)}s`);

    // Find the best beat using improved scoring system
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
      const beatTime = beats[beatIndex].time;
      const beatNum = beats[beatIndex].beatNum;
      const distance = Math.abs(chordStart - beatTime);

      // Only consider beats within reasonable range (1.5 seconds)
      if (distance <= 1.5) {
        let score = distance;

        // FIXED: Only prefer beat 1 (downbeats) for chord changes - no bonus for beat 3
        if (beatNum === 1) {
          score *= 0.6; // 40% bonus for downbeats only
          console.log(`  Beat ${beatIndex} (${beatTime.toFixed(3)}s, beat ${beatNum}): distance=${distance.toFixed(3)}s, DOWNBEAT BONUS, score=${score.toFixed(3)}`);
        } else {
          console.log(`  Beat ${beatIndex} (${beatTime.toFixed(3)}s, beat ${beatNum}): distance=${distance.toFixed(3)}s, score=${score.toFixed(3)}`);
        }

        // Prefer beats at or after chord start (forward-looking assignment)
        if (beatTime >= chordStart) {
          score *= 0.8; // 20% bonus for beats at/after chord start
          console.log(`    FORWARD ASSIGNMENT BONUS: score=${score.toFixed(3)}`);
        }

        // Avoid beats that are much closer to the chord end than start
        const distanceToEnd = Math.abs(chordEnd - beatTime);
        if (distanceToEnd < distance * 0.5) {
          score *= 1.5; // Penalty for beats closer to chord end
          console.log(`    CHORD END PENALTY: score=${score.toFixed(3)}`);
        }

        if (score < bestScore) {
          bestScore = score;
          bestBeatIndex = beatIndex;
        }
      }
    }

    console.log(`  ✅ Best match: Beat ${bestBeatIndex} (${beats[bestBeatIndex].time.toFixed(3)}s, beat ${beats[bestBeatIndex].beatNum}) with score ${bestScore.toFixed(3)}`);

    // Assign the chord to the best beat
    beatToChordMap.set(bestBeatIndex, chordName);
  }

  // Create synchronized chord array with forward-fill logic
  const synchronizedChords: {chord: string, beatIndex: number}[] = [];
  let currentChord = 'N/C'; // Default to "No Chord"

  for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
    // Check if this beat has a new chord assignment
    if (beatToChordMap.has(beatIndex)) {
      currentChord = beatToChordMap.get(beatIndex)!;
    }

    synchronizedChords.push({
      chord: currentChord,
      beatIndex: beatIndex
    });
  }

  console.log(`✅ Created ${synchronizedChords.length} synchronized chords`);
  return synchronizedChords;
}

/**
 * Pure model output synchronization: Improved chord-to-beat alignment
 */
export const synchronizeChords = (
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
) => {
  console.log('\n=== PURE MODEL OUTPUT SYNCHRONIZATION ===');
  console.log(`Input: ${chords.length} chords, ${beats.length} beats`);
  console.log(`Using direct model outputs without timing offset adjustments`);

  if (chords.length === 0 || beats.length === 0) {
    console.log('No chords or beats to synchronize');
    return [];
  }

  // Use improved musical context-aware alignment
  const result = alignChordsToBeatsDirectly(chords, beats);

  console.log(`✅ Pure synchronization complete: ${result.length} synchronized chords`);
  console.log('=== PURE MODEL OUTPUT SYNCHRONIZATION END ===\n');

  return result;
};

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