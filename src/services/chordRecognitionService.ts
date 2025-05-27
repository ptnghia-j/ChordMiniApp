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

    // Use the detailed beat info with strength values
    const beats = beatResults.beat_info;

    // Recognize chords using the Chord-CNN-LSTM model
    console.log(`Recognizing chords using ${chordDetector} model...`);
    const chordResults = await recognizeChords(audioFile, chordDetector);
    console.log(`Detected ${chordResults.length} chords`);

    // Create synchronized chords (chords aligned with beats) - using direct timing-based matching
    const timeSignature = beatResults.time_signature || 4; // Use detected time signature or default to 4
    const alignmentResult = alignChordsToBeatsDirectly(chordResults, beats, beatResults.beats_with_positions, timeSignature);

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
      downbeats_with_measures: beatResults.downbeats_with_measures,
      beats_with_positions: beatResults.beats_with_positions,
      synchronizedChords: alignmentResult.synchronizedChords,
      beatModel: beatResults.model,
      chordModel: chordDetector,
      beatDetectionResult: {
        time_signature: beatResults.time_signature, // Use detected time signature (no hardcoded fallback)
        bpm: beatResults.bpm,
        beatShift: alignmentResult.beatShift // Always 0 with direct alignment approach
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
 * Align chords to beat positions using direct timing-based matching
 *
 * This simplified approach respects backend beat positions exactly as provided,
 * creating a synchronized chord array with one chord per beat position.
 */
function alignChordsToBeatsDirectly(
  chords: ChordDetectionResult[],
  beats: BeatInfo[],
  beatsWithPositions?: BeatPosition[],
  timeSignature: number = 4
): {synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[], beatShift: number} {
  console.log(`=== COMPREHENSIVE CHORD-BEAT ALIGNMENT DEBUG ===`);
  console.log(`Aligning ${chords.length} chords to ${beats.length} beats using direct timing`);
  console.log('Time signature:', timeSignature);

  // Debug backend beat positions data
  console.log('\n🔍 BACKEND BEAT POSITIONS ANALYSIS:');
  let hasPickupBeats = false;
  let pickupBeatCount = 0;

  if (beatsWithPositions && beatsWithPositions.length > 0) {
    console.log(`Backend provided ${beatsWithPositions.length} beat positions`);
    console.log('First 15 backend beat positions:');
    for (let i = 0; i < Math.min(15, beatsWithPositions.length); i++) {
      const bp = beatsWithPositions[i];
      console.log(`  Backend Beat ${i}: time=${bp.time.toFixed(3)}s, beatNum=${bp.beatNum}`);
    }

    // Analyze beat number pattern
    const beatNums = beatsWithPositions.slice(0, 20).map(bp => bp.beatNum);
    console.log(`Beat number pattern: [${beatNums.join(', ')}]`);

    // PICKUP BEAT DETECTION: Check if first beat is not 1 (indicates pickup beats)
    const firstBeatNum = beatsWithPositions[0].beatNum;
    if (firstBeatNum !== 1) {
      hasPickupBeats = true;
      pickupBeatCount = timeSignature - firstBeatNum + 1;
      console.log(`🎵 PICKUP BEATS DETECTED: First beat is ${firstBeatNum}, indicating ${pickupBeatCount} pickup beat(s) in ${timeSignature}/4 time`);
      console.log(`This means the first chord should align to beat ${firstBeatNum}, not beat 1`);
    } else {
      console.log(`✅ No pickup beats detected - song starts on downbeat (beat 1)`);
    }

    // Check for pickup beats (legacy detection)
    const firstFewBeats = beatsWithPositions.slice(0, 5);
    const consecutiveBeat1s = firstFewBeats.filter(bp => bp.beatNum === 1);
    if (consecutiveBeat1s.length > 1) {
      console.log(`⚠️  POTENTIAL PICKUP ISSUE: Found ${consecutiveBeat1s.length} consecutive beats with beatNum=1`);
      console.log('This suggests pickup beats may not be properly numbered');
    }
  } else {
    console.log('⚠️  No backend beat positions provided - will use fallback numbering');
  }

  // Debug raw beats array
  console.log('\n🎵 RAW BEATS ARRAY ANALYSIS:');
  console.log('First 10 raw beats:');
  for (let i = 0; i < Math.min(10, beats.length); i++) {
    const beat = beats[i];
    const backendBeatNum = beatsWithPositions?.find(bp => Math.abs(bp.time - beat.time) < 0.01)?.beatNum;
    const fallbackBeatNum = ((i % timeSignature) + 1);
    const finalBeatNum = backendBeatNum || beat.beatNum || fallbackBeatNum;

    console.log(`  Beat ${i}: time=${beat.time.toFixed(3)}s, backendBeatNum=${backendBeatNum || 'N/A'}, fallbackBeatNum=${fallbackBeatNum}, finalBeatNum=${finalBeatNum}`);
  }

  // Debug chord timing with detailed analysis
  console.log('\n🎼 CHORD TIMING ANALYSIS:');
  console.log('All chords with timing details:');
  chords.forEach((chord, i) => {
    const duration = chord.end - chord.start;
    console.log(`  Chord ${i+1}: [${chord.start.toFixed(3)}s - ${chord.end.toFixed(3)}s] "${chord.chord}" (duration: ${duration.toFixed(3)}s)`);
  });

  // Analyze timing gaps between chords and beats
  console.log('\n⏱️  TIMING ANALYSIS:');
  if (chords.length > 0 && beats.length > 0) {
    const firstChordStart = chords[0].start;
    const firstBeatTime = beats[0].time;
    const timingOffset = firstBeatTime - firstChordStart;
    console.log(`First chord starts at: ${firstChordStart.toFixed(3)}s`);
    console.log(`First beat occurs at: ${firstBeatTime.toFixed(3)}s`);
    console.log(`Timing offset (beat - chord): ${timingOffset.toFixed(3)}s`);

    if (Math.abs(timingOffset) > 0.5) {
      console.log(`⚠️  LARGE TIMING OFFSET DETECTED: ${timingOffset.toFixed(3)}s`);
      console.log('This may cause systematic misalignment between chords and beats');
    }
  }

  // Create synchronized chord array with same length as beat array
  const synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[] = [];

  // Create beat number map from backend positions
  const beatNumMap = new Map<number, number>();
  if (beatsWithPositions) {
    beatsWithPositions.forEach(bp => {
      beatNumMap.set(bp.time, bp.beatNum);
    });
    console.log(`Using ${beatsWithPositions.length} beat positions from backend`);
  }

  // Step 1: Create a map of chord assignments to beats using musically-aware matching
  const beatToChordMap = new Map<number, string>();

  // Array to store compact chord-beat assignments for output
  const chordBeatAssignments: Array<{
    chord: string;
    chordStart: number;
    beatTime: number;
    beatNum: number;
    distance: number;
    isDownbeat: boolean;
  }> = [];

  // For each chord, find the best beat assignment considering musical context
  for (const chord of chords) {
    // Don't skip "N" chords - they represent important "no chord" sections
    const chordName = chord.chord === "N" ? "N/C" : chord.chord;

    let bestBeatIndex = 0;
    let bestScore = Infinity;
    let bestDistance = Infinity;

    // Find beats within reasonable distance and score them musically
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
      const beatTime = beats[beatIndex].time;
      const distance = Math.abs(chord.start - beatTime);

      // Only consider beats within 1.5s (more generous for pickup beats)
      if (distance <= 1.5) {
        const beatNum = beatNumMap.get(beatTime) || beats[beatIndex].beatNum || ((beatIndex % timeSignature) + 1);

        // Calculate musical score (lower is better)
        let score = distance;

        // PICKUP BEAT FIX: Adjust scoring based on pickup beat detection
        if (hasPickupBeats && chord.start < 2.0) {
          // For early chords in songs with pickup beats, prefer the first beat (which is the pickup beat)
          if (beatIndex === 0) {
            score *= 0.5; // Strong preference for the first beat (pickup beat)
            console.log(`Pickup chord "${chordName}" (start: ${chord.start.toFixed(3)}s) - preferring first beat ${beatNum} (pickup)`);
          }
        } else if (chord.start < 2.0) {
          // For early chords without pickup beats, just use distance - no beat number preference
          console.log(`Early chord "${chordName}" (start: ${chord.start.toFixed(3)}s) - using distance-only scoring for beat ${beatNum}`);
        } else {
          // For later chords, prefer downbeats (beatNum = 1) for chord changes
          if (beatNum === 1) {
            score *= 0.6; // 40% bonus for downbeats (reduced from 50% to be less aggressive)
          }
        }

        // Prefer beats that are at or after chord start (not before)
        if (beatTime >= chord.start) {
          score *= 0.8; // 20% bonus for beats at/after chord start
        }

        if (score < bestScore) {
          bestScore = score;
          bestBeatIndex = beatIndex;
          bestDistance = distance;
        }
      }
    }

    // Assign the chord to the best beat found
    if (bestScore < Infinity) {
      beatToChordMap.set(bestBeatIndex, chordName);

      const beatTime = beats[bestBeatIndex].time;
      const beatNum = beatNumMap.get(beatTime) || beats[bestBeatIndex].beatNum || ((bestBeatIndex % timeSignature) + 1);

      // Store assignment for compact output
      chordBeatAssignments.push({
        chord: chordName,
        chordStart: chord.start,
        beatTime: beatTime,
        beatNum: beatNum,
        distance: bestDistance,
        isDownbeat: beatNum === 1
      });
    } else {
      // Log chords that couldn't be assigned
      console.log(`⚠️  Chord "${chordName}" (start: ${chord.start.toFixed(3)}s) could not be assigned to any beat`);
    }
  }

  // Step 2: Create synchronized chord array with chord sustaining
  console.log(`\n🔄 SYNCHRONIZED CHORD ARRAY CREATION:`);
  let currentChord = 'N/C'; // Default to no chord

  for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
    const beat = beats[beatIndex];
    const beatTime = beat.time;

    // FIX 2: Preserve backend beat numbers - prioritize backend data over fallbacks
    let beatNum: number;

    // First priority: backend beats_with_positions data
    if (beatNumMap.has(beatTime)) {
      beatNum = beatNumMap.get(beatTime)!;
    }
    // Second priority: beat info from beat detection (if available)
    else if (beat.beatNum && beat.beatNum > 0) {
      beatNum = beat.beatNum;
    }
    // Last resort: calculate from index (should rarely be used)
    else {
      beatNum = ((beatIndex % timeSignature) + 1);
      console.warn(`⚠️  Using fallback beat numbering for beat ${beatIndex} at time ${beatTime.toFixed(3)}s`);
    }

    // Check if this beat has a new chord assignment
    const hasNewChord = beatToChordMap.has(beatIndex);
    if (hasNewChord) {
      currentChord = beatToChordMap.get(beatIndex)!;
    }
    // Otherwise sustain the previous chord

    synchronizedChords.push({
      chord: currentChord,
      beatIndex: beatIndex,
      beatNum: beatNum // This now correctly preserves backend beat numbers
    });

    // Enhanced debug for first 12 beat assignments
    if (beatIndex < 12) {
      const isNewChord = hasNewChord ? ' (NEW CHORD)' : ' (sustained)';
      const isDownbeat = beatNum === 1 ? ' [DOWNBEAT]' : '';
      console.log(`  SyncBeat ${beatIndex}: time=${beatTime.toFixed(3)}s, beatNum=${beatNum}${isDownbeat}, chord="${currentChord}"${isNewChord}`);
    }
  }

  // FIX 3: Enhanced analysis and summary with beat number validation
  console.log(`\n📊 ALIGNMENT SUMMARY:`);
  console.log(`Created ${synchronizedChords.length} synchronized chord-beat pairs`);

  // Validate that backend beat numbers are preserved
  const backendBeatNums = synchronizedChords.slice(0, 15).map(sc => sc.beatNum);
  console.log(`Final synchronized beat number pattern: [${backendBeatNums.join(', ')}]`);

  // Check if we successfully preserved backend beat numbers
  if (beatsWithPositions && beatsWithPositions.length > 0) {
    const originalBackendPattern = beatsWithPositions.slice(0, 15).map(bp => bp.beatNum);
    const preserved = JSON.stringify(backendBeatNums) === JSON.stringify(originalBackendPattern);

    if (preserved) {
      console.log(`✅ SUCCESS: Backend beat numbers correctly preserved in synchronized chords`);
    } else {
      console.error(`❌ ERROR: Backend beat numbers NOT preserved!`);
      console.error(`Original backend pattern: [${originalBackendPattern.join(', ')}]`);
      console.error(`Final synchronized pattern: [${backendBeatNums.join(', ')}]`);
    }
  }

  // Analyze downbeat assignments
  const downbeatAssignments = synchronizedChords.filter(sc => sc.beatNum === 1);
  const nonDownbeatAssignments = synchronizedChords.filter(sc => sc.beatNum !== 1);
  const newChordOnDownbeats = downbeatAssignments.filter(sc => beatToChordMap.has(sc.beatIndex));
  const newChordOnNonDownbeats = nonDownbeatAssignments.filter(sc => beatToChordMap.has(sc.beatIndex));

  console.log(`Total downbeats (beatNum=1): ${downbeatAssignments.length}`);
  console.log(`New chords assigned to downbeats: ${newChordOnDownbeats.length}`);
  console.log(`New chords assigned to non-downbeats: ${newChordOnNonDownbeats.length}`);

  if (newChordOnNonDownbeats.length > newChordOnDownbeats.length) {
    console.log(`⚠️  SYSTEMATIC MISALIGNMENT DETECTED:`);
    console.log(`More chords assigned to non-downbeats (${newChordOnNonDownbeats.length}) than downbeats (${newChordOnDownbeats.length})`);
    if (hasPickupBeats) {
      console.log(`Note: This song has pickup beats, so some chords on non-downbeats may be expected`);
    } else {
      console.log(`This suggests the beat numbering or chord timing may be offset`);
    }
  }

  // Pickup beat analysis summary
  if (hasPickupBeats) {
    console.log(`\n🎵 PICKUP BEAT ANALYSIS SUMMARY:`);
    console.log(`Detected ${pickupBeatCount} pickup beat(s) in ${timeSignature}/4 time`);
    console.log(`First beat number: ${beatsWithPositions?.[0]?.beatNum} (should be ${timeSignature - pickupBeatCount + 1})`);

    const firstChordAssignment = chordBeatAssignments[0];
    if (firstChordAssignment) {
      console.log(`First chord "${firstChordAssignment.chord}" assigned to beat ${firstChordAssignment.beatNum}`);
      if (firstChordAssignment.beatNum === beatsWithPositions?.[0]?.beatNum) {
        console.log(`✅ First chord correctly aligned to pickup beat`);
      } else {
        console.log(`⚠️  First chord may be misaligned - expected beat ${beatsWithPositions?.[0]?.beatNum}`);
      }
    }
  }

  // Compact chord-beat timing output (only output once per session)
  if (!(window as any).chordBeatDebugShown) {
    console.log(`\n📋 CHORD-BEAT ASSIGNMENTS (first 15):`);
    console.table(chordBeatAssignments.slice(0, 15).map(assignment => ({
      Chord: assignment.chord,
      'Chord Start': `${assignment.chordStart.toFixed(3)}s`,
      'Beat Time': `${assignment.beatTime.toFixed(3)}s`,
      'Beat #': assignment.beatNum,
      'Distance': `${assignment.distance.toFixed(3)}s`,
      'Type': assignment.isDownbeat ? 'DOWNBEAT' : `Beat ${assignment.beatNum}`
    })));

    // Show first few beat timestamps for comparison
    console.log(`\n⏰ BEAT TIMESTAMPS (first 15):`);
    console.table(beats.slice(0, 15).map((beat, idx) => ({
      Index: idx,
      'Beat Time': `${beat.time.toFixed(3)}s`,
      'Beat #': beatNumMap.get(beat.time) || beat.beatNum || ((idx % timeSignature) + 1),
      'Type': (beatNumMap.get(beat.time) || beat.beatNum || ((idx % timeSignature) + 1)) === 1 ? 'DOWNBEAT' : 'Regular'
    })));

    (window as any).chordBeatDebugShown = true;
  }

  console.log(`=== END COMPREHENSIVE ALIGNMENT DEBUG ===`);

  return {
    synchronizedChords,
    beatShift: 0 // No shifting in direct approach
  };
}

// Removed unused findOptimalBeatShift function - direct alignment doesn't use shifting

// Removed unused calculateAlignmentScore function - direct alignment doesn't use scoring

// Removed unused alignChordsToBeats function - replaced with alignChordsToBeatsDirectly

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