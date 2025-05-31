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
  time: number;        // Time in seconds (alias for start for compatibility)
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
  downbeats_with_measures?: DownbeatInfo[];
  beats_with_positions?: BeatPosition[];
  synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[];
  beatModel?: string;    // Which model was used for beat detection
  chordModel?: string;   // Which model was used for chord detection
  beatDetectionResult?: {
    time_signature?: number; // Time signature (beats per measure)
    bpm?: number;           // Beats per minute
    beatShift?: number;     // Beat shift for alignment
    beat_time_range_start?: number; // Start time of beat detection range
  };
}

/**
 * Process audio file and perform chord and beat analysis
 * @param audioInput Either an AudioBuffer or a URL string to the audio file
 * @param beatDetector Optional detector to use ('auto', 'madmom', 'beat-transformer', or 'beat-transformer-light')
 * @param chordDetector Optional chord detector to use ('chord-cnn-lstm')
 * @returns Promise with analysis results (chords and beats)
 */
export async function analyzeAudio(
  audioInput: AudioBuffer | string,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' | 'beat-transformer-light' = 'auto',
  chordDetector: 'chord-cnn-lstm' = 'chord-cnn-lstm'
): Promise<AnalysisResult> {
  try {
    console.log('Starting audio analysis...');
    console.log('Audio input type:', typeof audioInput);

    // Enhanced input validation and bounds checking
    let audioFile: File;

    if (typeof audioInput === 'string') {
      // Handle URL input - fetch and convert to File
      console.log('Processing audio from URL:', audioInput);

      try {
        const response = await fetch(audioInput);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
        }

        const audioBlob = await response.blob();

        // Validate audio blob size and format
        if (audioBlob.size === 0) {
          throw new Error('Audio file is empty or corrupted');
        }

        if (audioBlob.size > 100 * 1024 * 1024) { // 100MB limit
          throw new Error('Audio file is too large (>100MB). Please use a smaller file.');
        }

        audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });
        console.log(`Audio file created from URL: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);

      } catch (fetchError) {
        console.error('Error fetching audio from URL:', fetchError);
        throw new Error(`Failed to load audio from URL: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }

    } else if (audioInput instanceof AudioBuffer) {
      // Handle AudioBuffer input - validate and convert
      console.log('Processing AudioBuffer input');

      // Validate AudioBuffer properties
      if (!audioInput || audioInput.length === 0) {
        throw new Error('AudioBuffer is empty or invalid');
      }

      if (audioInput.duration === 0) {
        throw new Error('AudioBuffer has zero duration');
      }

      if (audioInput.duration > 300) { // 5 minutes limit
        throw new Error('Audio duration exceeds maximum supported length (5 minutes). Please use a shorter audio file.');
      }

      if (audioInput.sampleRate < 8000 || audioInput.sampleRate > 192000) {
        throw new Error(`Unsupported sample rate: ${audioInput.sampleRate}Hz. Supported range: 8kHz-192kHz`);
      }

      console.log(`AudioBuffer properties: duration=${audioInput.duration.toFixed(2)}s, sampleRate=${audioInput.sampleRate}Hz, channels=${audioInput.numberOfChannels}`);

      try {
        // Convert AudioBuffer to File/Blob for API calls with bounds checking
        const audioBlob = await audioBufferToWav(audioInput);
        audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });
        console.log(`AudioBuffer converted to file: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);

      } catch (conversionError) {
        console.error('Error converting AudioBuffer to WAV:', conversionError);
        throw new Error(`Failed to convert audio buffer: ${conversionError instanceof Error ? conversionError.message : 'Unknown conversion error'}`);
      }

    } else {
      throw new Error('Invalid audio input: must be either AudioBuffer or URL string');
    }

    // Detect beats using the Python API with specified detector with enhanced error handling
    console.log(`Detecting beats using ${beatDetector} model...`);
    let beatResults;

    try {
      beatResults = await detectBeatsFromFile(audioFile, beatDetector);

      // Validate beat detection results
      if (!beatResults || !beatResults.success) {
        throw new Error(`Beat detection failed: ${beatResults?.error || 'Unknown error from beat detection service'}`);
      }

      if (!beatResults.beats || !Array.isArray(beatResults.beats)) {
        throw new Error('Invalid beat detection results: missing or invalid beats array');
      }

      if (beatResults.beats.length === 0) {
        throw new Error('No beats detected in the audio. The audio may be too quiet, too short, or not contain rhythmic content.');
      }

      // Validate beat timestamps for bounds issues
      const invalidBeats = beatResults.beats.filter((time: number) =>
        typeof time !== 'number' || isNaN(time) || time < 0 || time > 3600 // 1 hour max
      );

      if (invalidBeats.length > 0) {
        console.warn(`⚠️  Found ${invalidBeats.length} invalid beat timestamps, filtering them out`);
        beatResults.beats = beatResults.beats.filter((time: number) =>
          typeof time === 'number' && !isNaN(time) && time >= 0 && time <= 3600
        );

        if (beatResults.beats.length === 0) {
          throw new Error('All detected beats have invalid timestamps');
        }
      }

    } catch (beatError) {
      console.error('Error in beat detection:', beatError);

      // Provide specific error messages based on the error type
      if (beatError instanceof Error) {
        if (beatError.message.includes('too large')) {
          throw new Error('Audio file is too large for beat detection. Try using a shorter audio clip or the madmom detector.');
        } else if (beatError.message.includes('413')) {
          throw new Error('Audio file size exceeds server limits. Please use a smaller file or try the madmom detector.');
        } else if (beatError.message.includes('timeout')) {
          throw new Error('Beat detection timed out. Try using a shorter audio clip or the madmom detector.');
        } else {
          throw new Error(`Beat detection failed: ${beatError.message}`);
        }
      } else {
        throw new Error('Beat detection failed with unknown error');
      }
    }

    // Enhanced debug logging for beat detection results
    console.log('=== CHORD RECOGNITION SERVICE - BEAT DETECTION DEBUG ===');
    console.log('Raw beatResults object:', beatResults);
    console.log('beatResults.time_signature:', beatResults.time_signature);
    console.log('beatResults.bpm:', beatResults.bpm);
    console.log('beatResults.model:', beatResults.model);
    console.log(`Validated ${beatResults.beats.length} beat timestamps`);

    // Verify beats_with_positions data integrity
    if (beatResults.beats_with_positions && Array.isArray(beatResults.beats_with_positions)) {
      console.log(`Received ${beatResults.beats_with_positions.length} beats with positions from beat detection service`);
      const beatPattern = beatResults.beats_with_positions.slice(0, 15).map((bp: any) => bp.beatNum);
      console.log(`Beat pattern from beat detection service: [${beatPattern.join(', ')}]`);

      // Check for data integrity issues
      const invalidBeats = beatResults.beats_with_positions.filter((bp: any) => !bp.beatNum || !bp.time);
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

    // Convert pure model beat timestamps to BeatInfo format with bounds checking
    const beats: BeatInfo[] = [];

    try {
      for (let index = 0; index < beatResults.beats.length; index++) {
        const time = beatResults.beats[index];

        // Additional bounds checking for individual beats
        if (typeof time !== 'number' || isNaN(time) || time < 0) {
          console.warn(`Skipping invalid beat at index ${index}: ${time}`);
          continue;
        }

        beats.push({
          time,
          strength: 0.8, // Default strength since backend no longer provides this
          beatNum: (index % (beatResults.time_signature || 4)) + 1
        });
      }

      if (beats.length === 0) {
        throw new Error('No valid beats could be processed from detection results');
      }

      console.log(`Successfully processed ${beats.length} beats from ${beatResults.beats.length} detected beats`);

    } catch (beatProcessingError) {
      console.error('Error processing beats:', beatProcessingError);
      throw new Error(`Failed to process beat detection results: ${beatProcessingError instanceof Error ? beatProcessingError.message : 'Unknown error'}`);
    }

    // Recognize chords using the Chord-CNN-LSTM model with enhanced error handling
    console.log(`Recognizing chords using ${chordDetector} model...`);
    let chordResults;

    try {
      chordResults = await recognizeChords(audioFile, chordDetector);

      // Validate chord recognition results
      if (!chordResults || !Array.isArray(chordResults)) {
        throw new Error('Invalid chord recognition results: expected array of chords');
      }

      if (chordResults.length === 0) {
        console.warn('No chords detected in the audio. This may be an instrumental track or the audio may not contain harmonic content.');
        // Don't throw an error here - some audio may legitimately have no chords
      }

      // Validate chord timestamps for bounds issues
      const invalidChords = chordResults.filter(chord =>
        !chord ||
        typeof chord.start !== 'number' ||
        typeof chord.end !== 'number' ||
        isNaN(chord.start) ||
        isNaN(chord.end) ||
        chord.start < 0 ||
        chord.end < 0 ||
        chord.start >= chord.end ||
        chord.end > 3600 // 1 hour max
      );

      if (invalidChords.length > 0) {
        console.warn(`⚠️  Found ${invalidChords.length} invalid chord timestamps, filtering them out`);
        chordResults = chordResults.filter(chord =>
          chord &&
          typeof chord.start === 'number' &&
          typeof chord.end === 'number' &&
          !isNaN(chord.start) &&
          !isNaN(chord.end) &&
          chord.start >= 0 &&
          chord.end >= 0 &&
          chord.start < chord.end &&
          chord.end <= 3600
        );
      }

      console.log(`Detected ${chordResults.length} valid chords`);

    } catch (chordError) {
      console.error('Error in chord recognition:', chordError);

      // Provide specific error messages based on the error type
      if (chordError instanceof Error) {
        if (chordError.message.includes('too large')) {
          throw new Error('Audio file is too large for chord recognition. Try using a shorter audio clip.');
        } else if (chordError.message.includes('413')) {
          throw new Error('Audio file size exceeds server limits for chord recognition. Please use a smaller file.');
        } else if (chordError.message.includes('timeout')) {
          throw new Error('Chord recognition timed out. Try using a shorter audio clip.');
        } else {
          throw new Error(`Chord recognition failed: ${chordError.message}`);
        }
      } else {
        throw new Error('Chord recognition failed with unknown error');
      }
    }

    // Create synchronized chords using pure model outputs with bounds checking
    let synchronizedChords;

    try {
      synchronizedChords = synchronizeChords(chordResults, beats);

      // Validate synchronization results
      if (!synchronizedChords || !Array.isArray(synchronizedChords)) {
        throw new Error('Chord synchronization failed: invalid result format');
      }

      // Check for bounds issues in synchronized chords
      const invalidSyncChords = synchronizedChords.filter((syncChord: any) =>
        !syncChord ||
        typeof syncChord.beatIndex !== 'number' ||
        isNaN(syncChord.beatIndex) ||
        syncChord.beatIndex < 0 ||
        syncChord.beatIndex >= beats.length ||
        !syncChord.chord
      );

      if (invalidSyncChords.length > 0) {
        console.warn(`⚠️  Found ${invalidSyncChords.length} invalid synchronized chords, filtering them out`);
        synchronizedChords = synchronizedChords.filter((syncChord: any) =>
          syncChord &&
          typeof syncChord.beatIndex === 'number' &&
          !isNaN(syncChord.beatIndex) &&
          syncChord.beatIndex >= 0 &&
          syncChord.beatIndex < beats.length &&
          syncChord.chord
        );
      }

      console.log(`Successfully synchronized ${synchronizedChords.length} chords to beats`);

    } catch (syncError) {
      console.error('Error in chord synchronization:', syncError);

      // Provide fallback synchronization if main sync fails
      console.log('Attempting fallback synchronization...');
      synchronizedChords = beats.map((beat, index) => ({
        chord: 'N/C', // No chord fallback
        beatIndex: index
      }));

      console.warn(`Used fallback synchronization with ${synchronizedChords.length} N/C chords`);
    }

    // Debug: Log the beat detection result before creating the final analysis result
    console.log('=== CHORD RECOGNITION SERVICE DEBUG ===');
    console.log('beatResults.time_signature:', beatResults.time_signature);
    console.log('beatResults.time_signature type:', typeof beatResults.time_signature);
    console.log('beatResults.bpm:', beatResults.bpm);
    console.log('beatResults.model:', beatResults.model);
    console.log('Final analysis summary:');
    console.log(`  - ${chordResults.length} chords detected`);
    console.log(`  - ${beats.length} beats processed`);
    console.log(`  - ${synchronizedChords.length} synchronized chord-beat pairs`);
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

    // Enhanced error handling with specific suggestions
    if (error instanceof Error) {
      if (error.message.includes('out of bounds') || error.message.includes('bounds')) {
        throw new Error('Audio analysis failed due to data bounds error. This may be caused by corrupted audio data or unsupported audio format. Please try a different audio file or format.');
      } else if (error.message.includes('memory') || error.message.includes('allocation')) {
        throw new Error('Audio analysis failed due to memory constraints. Please try a shorter audio clip or use a different detector model.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Audio analysis timed out. Please try a shorter audio clip or use the madmom detector for better performance.');
      } else {
        throw new Error(`Audio analysis failed: ${error.message}`);
      }
    } else {
      throw new Error('Audio analysis failed with unknown error. Please try a different audio file or contact support.');
    }
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

    // Validate input file
    if (!audioFile || audioFile.size === 0) {
      throw new Error('Invalid audio file for chord recognition');
    }

    if (audioFile.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('Audio file is too large for chord recognition (>100MB)');
    }

    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', audioFile);

    // Call the Python backend API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    let response;
    try {
      response = await fetch('/api/recognize-chords', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (textError) {
        errorText = 'Unable to read error response';
      }

      if (response.status === 413) {
        throw new Error('Audio file is too large for chord recognition. Please use a smaller file.');
      } else if (response.status === 408 || response.status === 504) {
        throw new Error('Chord recognition timed out. Please try a shorter audio clip.');
      } else {
        throw new Error(`Chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('Invalid response format from chord recognition API');
    }

    if (!data.success) {
      throw new Error(`Chord recognition failed: ${data.error || 'Unknown error from chord recognition service'}`);
    }

    if (!data.chords || !Array.isArray(data.chords)) {
      throw new Error('Invalid chord recognition response: missing or invalid chords array');
    }

    console.log(`Received ${data.chords.length} chords from the API`);
    console.log('First 5 chords from API:', data.chords.slice(0, 5));

    // Convert the API response to ChordDetectionResult format with validation
    const chords: ChordDetectionResult[] = [];

    for (let i = 0; i < data.chords.length; i++) {
      const chord = data.chords[i];

      // Validate each chord object
      if (!chord || typeof chord !== 'object') {
        console.warn(`Skipping invalid chord at index ${i}: not an object`);
        continue;
      }

      if (typeof chord.start !== 'number' || typeof chord.end !== 'number') {
        console.warn(`Skipping chord at index ${i}: invalid start/end times`);
        continue;
      }

      if (isNaN(chord.start) || isNaN(chord.end)) {
        console.warn(`Skipping chord at index ${i}: NaN start/end times`);
        continue;
      }

      if (chord.start < 0 || chord.end < 0 || chord.start >= chord.end) {
        console.warn(`Skipping chord at index ${i}: invalid time range (${chord.start}-${chord.end})`);
        continue;
      }

      if (!chord.chord || typeof chord.chord !== 'string') {
        console.warn(`Skipping chord at index ${i}: invalid chord name`);
        continue;
      }

      chords.push({
        start: chord.start,
        end: chord.end,
        time: chord.start, // Add time property as alias for start
        chord: chord.chord,
        confidence: typeof chord.confidence === 'number' ? chord.confidence : 0.9
      });
    }

    if (chords.length === 0 && data.chords.length > 0) {
      throw new Error('All chord recognition results were invalid or corrupted');
    }

    // Sort chords by start time
    chords.sort((a, b) => a.start - b.start);

    console.log(`Processed and sorted ${chords.length} valid chords from ${data.chords.length} raw results`);
    console.log('First 5 processed chords:', chords.slice(0, 5));

    return chords;
  } catch (error) {
    console.error('Error in chord recognition:', error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Chord recognition was cancelled due to timeout. Please try a shorter audio clip.');
      } else {
        throw new Error(`Failed to recognize chords: ${error.message}`);
      }
    } else {
      throw new Error('Failed to recognize chords: Unknown error occurred');
    }
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
  console.log(`\n🔗 === CHORD-TO-BEAT ALIGNMENT DETAILED LOG ===`);
  console.log(`Aligning ${chords.length} chords to ${beats.length} beats using pure temporal accuracy`);

  if (chords.length === 0 || beats.length === 0) {
    console.log('No chords or beats to align');
    return [];
  }

  console.log(`\n📋 ALIGNMENT INPUT VERIFICATION:`);
  console.log(`🎼 Chord Model Inputs:`);
  chords.forEach((chord, index) => {
    const chordName = chord.chord === "N" ? "N/C" : chord.chord;
    console.log(`  Input Chord ${(index + 1).toString().padStart(2)}: [${chord.start.toFixed(3)}s, ${chord.end.toFixed(3)}s] "${chordName}"`);
  });

  console.log(`\n🥁 Beat Model Inputs (showing all ${beats.length} beats):`);
  beats.forEach((beat, index) => {
    console.log(`  Input Beat ${(index + 1).toString().padStart(3)}: ${beat.time.toFixed(3)}s (beat ${beat.beatNum})`);
  });

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

    // ULTRA-AGGRESSIVE TEMPORAL ACCURACY - Find the absolute closest beat
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
      const beatTime = beats[beatIndex].time;
      const beatNum = beats[beatIndex].beatNum;
      const distance = Math.abs(chordStart - beatTime);

      // EXPANDED range but PURE distance-based scoring
      if (distance <= 2.0) {
        // PURE temporal accuracy - NO musical context bonuses at all
        let score = distance;

        console.log(`  Beat ${beatIndex} (${beatTime.toFixed(3)}s, beat ${beatNum}): distance=${distance.toFixed(3)}s, score=${score.toFixed(3)}`);

        // REMOVED ALL BONUSES - pure distance-based alignment
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
  console.log(`\n📊 CREATING SYNCHRONIZED BEAT-TO-CHORD MAPPING:`);
  const synchronizedChords: {chord: string, beatIndex: number}[] = [];
  let currentChord = 'N/C'; // Default to "No Chord"

  for (let beatIndex = 0; beatIndex < beats.length; beatIndex++) {
    // Check if this beat has a new chord assignment
    if (beatToChordMap.has(beatIndex)) {
      const newChord = beatToChordMap.get(beatIndex)!;
      console.log(`  🎵 Beat ${beatIndex.toString().padStart(3)} (${beats[beatIndex].time.toFixed(3)}s): CHORD CHANGE "${currentChord}" -> "${newChord}"`);
      currentChord = newChord;
    }

    synchronizedChords.push({
      chord: currentChord,
      beatIndex: beatIndex
    });
  }

  console.log(`\n📋 COMPLETE SYNCHRONIZED OUTPUT (all ${synchronizedChords.length} beats):`);
  synchronizedChords.forEach((item, index) => {
    const beatTime = beats[item.beatIndex].time;
    const beatNum = beats[item.beatIndex].beatNum;
    console.log(`  SyncBeat ${(index + 1).toString().padStart(3)}: "${item.chord.padEnd(8)}" at ${beatTime.toFixed(3)}s (beat ${beatNum})`);
  });

  console.log(`✅ Created ${synchronizedChords.length} synchronized chords`);

  // CHORD MODEL vs BEAT GRID DURATION COMPARISON
  console.log(`\n📊 CHORD MODEL vs BEAT GRID DURATION COMPARISON:`);
  console.log(`🎼 Original Chord Model Output:`);
  chords.forEach((chord, index) => {
    const duration = chord.end - chord.start;
    const chordName = chord.chord === "N" ? "N/C" : chord.chord;
    console.log(`  Chord ${index + 1}: [${chord.start.toFixed(3)}s, ${chord.end.toFixed(3)}s, '${chordName}'] duration=${duration.toFixed(3)}s`);
  });

  console.log(`\n🎯 Beat Grid Synchronized Output:`);
  // Group consecutive identical chords in synchronized output
  const groupedSyncChords: Array<{chord: string, startBeat: number, endBeat: number, startTime: number, endTime: number, duration: number}> = [];
  let currentGroup = { chord: synchronizedChords[0]?.chord || 'N/C', startIndex: 0 };

  for (let i = 1; i <= synchronizedChords.length; i++) {
    const currentChord = i < synchronizedChords.length ? synchronizedChords[i].chord : 'END';

    if (currentChord !== currentGroup.chord || i === synchronizedChords.length) {
      const endIndex = i - 1;
      const startBeatIndex = synchronizedChords[currentGroup.startIndex]?.beatIndex || 0;
      const endBeatIndex = synchronizedChords[endIndex]?.beatIndex || 0;
      const startTime = beats[startBeatIndex]?.time || 0;
      const endTime = beats[endBeatIndex]?.time || 0;
      const duration = endTime - startTime;

      groupedSyncChords.push({
        chord: currentGroup.chord,
        startBeat: startBeatIndex,
        endBeat: endBeatIndex,
        startTime: startTime,
        endTime: endTime,
        duration: duration
      });

      if (i < synchronizedChords.length) {
        currentGroup = { chord: currentChord, startIndex: i };
      }
    }
  }

  groupedSyncChords.forEach((segment, index) => {
    const durationStr = segment.duration.toFixed(3) + 's';
    console.log(`  Segment ${index + 1}: [${segment.startTime.toFixed(3)}s, ${segment.endTime.toFixed(3)}s, '${segment.chord}'] duration=${durationStr} beats[${segment.startBeat}-${segment.endBeat}]`);
  });

  console.log(`📊 END DURATION COMPARISON\n`);

  return synchronizedChords;
}

/**
 * Pure model output synchronization: Improved chord-to-beat alignment
 */
export const synchronizeChords = (
  chords: ChordDetectionResult[],
  beats: BeatInfo[]
) => {
  console.log('\n🎯 === COMPLETE CHORD-BEAT SYNCHRONIZATION PIPELINE ===');
  console.log(`Input: ${chords.length} chords, ${beats.length} beats`);
  console.log(`Using direct model outputs without timing offset adjustments`);

  // STAGE 1: Log original model outputs
  console.log('\n🎼 STAGE 1: ORIGINAL MODEL OUTPUTS');
  console.log('📊 Chord Model Raw Output:');
  chords.forEach((chord, index) => {
    const chordName = chord.chord === "N" ? "N/C" : chord.chord;
    const duration = chord.end - chord.start;
    console.log(`  Chord ${(index + 1).toString().padStart(2)}: [${chord.start.toFixed(3)}s, ${chord.end.toFixed(3)}s] "${chordName.padEnd(8)}" duration=${duration.toFixed(3)}s`);
  });

  console.log(`\n🥁 Beat Model Raw Output (all ${beats.length} beats):`);
  beats.forEach((beat, index) => {
    console.log(`  Beat ${(index + 1).toString().padStart(3)}: ${beat.time.toFixed(3)}s (beat ${beat.beatNum})`);
  });

  if (chords.length === 0 || beats.length === 0) {
    console.log('No chords or beats to synchronize');
    return [];
  }

  // STAGE 2: Perform alignment
  console.log('\n🔗 STAGE 2: CHORD-TO-BEAT ALIGNMENT');
  const result = alignChordsToBeatsDirectly(chords, beats);

  // STAGE 3: Analyze alignment results
  console.log('\n📈 STAGE 3: ALIGNMENT RESULTS ANALYSIS');
  console.log('🎯 Chord Alignment Summary:');

  // Create alignment summary
  const alignmentSummary: Array<{
    originalChord: ChordDetectionResult,
    alignedBeatIndex: number,
    alignedBeatTime: number,
    timingShift: number,
    chordName: string
  }> = [];

  chords.forEach((originalChord, chordIndex) => {
    const chordName = originalChord.chord === "N" ? "N/C" : originalChord.chord;

    // Find this chord in the alignment results
    const alignedResult = result.find(item => {
      // Find the beat that this chord was assigned to
      const beatTime = beats[item.beatIndex]?.time;
      return beatTime && Math.abs(originalChord.start - beatTime) < 2.0; // Within 2 seconds
    });

    if (alignedResult) {
      const alignedBeatTime = beats[alignedResult.beatIndex].time;
      const timingShift = alignedBeatTime - originalChord.start;

      alignmentSummary.push({
        originalChord,
        alignedBeatIndex: alignedResult.beatIndex,
        alignedBeatTime,
        timingShift,
        chordName
      });

      const shiftStr = timingShift >= 0 ? `+${timingShift.toFixed(3)}s` : `${timingShift.toFixed(3)}s`;
      console.log(`  Chord "${chordName.padEnd(8)}": ${originalChord.start.toFixed(3)}s -> ${alignedBeatTime.toFixed(3)}s (shift: ${shiftStr})`);
    } else {
      console.log(`  Chord "${chordName.padEnd(8)}": ${originalChord.start.toFixed(3)}s -> NOT ALIGNED`);
    }
  });

  // Calculate alignment statistics
  const shifts = alignmentSummary.map(item => item.timingShift);
  const avgShift = shifts.reduce((sum, shift) => sum + shift, 0) / shifts.length;
  const maxShift = Math.max(...shifts.map(Math.abs));

  console.log(`\n📊 Alignment Statistics:`);
  console.log(`  Average timing shift: ${avgShift >= 0 ? '+' : ''}${avgShift.toFixed(3)}s`);
  console.log(`  Maximum absolute shift: ${maxShift.toFixed(3)}s`);
  console.log(`  Shifts > 0.5s: ${shifts.filter(s => Math.abs(s) > 0.5).length}/${shifts.length}`);
  console.log(`  Shifts > 1.0s: ${shifts.filter(s => Math.abs(s) > 1.0).length}/${shifts.length}`);

  console.log(`✅ Pure synchronization complete: ${result.length} synchronized chords`);
  console.log('=== PURE MODEL OUTPUT SYNCHRONIZATION END ===\n');

  return result;
};

/**
 * Convert AudioBuffer to WAV format with enhanced bounds checking
 * This is needed to send the audio data to the Python API
 */
async function audioBufferToWav(audioBuffer: AudioBuffer): Promise<Blob> {
  try {
    // Validate AudioBuffer properties
    if (!audioBuffer) {
      throw new Error('AudioBuffer is null or undefined');
    }

    const numOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    // Bounds checking for AudioBuffer properties
    if (numOfChannels <= 0 || numOfChannels > 32) {
      throw new Error(`Invalid number of channels: ${numOfChannels}. Must be between 1 and 32.`);
    }

    if (length <= 0 || length > 192000 * 300) { // Max 5 minutes at 192kHz
      throw new Error(`Invalid audio length: ${length} samples. Must be between 1 and ${192000 * 300} samples.`);
    }

    if (sampleRate <= 0 || sampleRate > 192000) {
      throw new Error(`Invalid sample rate: ${sampleRate}Hz. Must be between 1 and 192000 Hz.`);
    }

    console.log(`Converting AudioBuffer: ${numOfChannels} channels, ${length} samples, ${sampleRate}Hz`);

    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;

    // Check for potential overflow in buffer size calculation
    if (dataSize > 2147483647) { // 2GB limit
      throw new Error(`Audio data too large: ${dataSize} bytes. Maximum supported size is 2GB.`);
    }

    const totalBufferSize = 44 + dataSize;
    if (totalBufferSize > 2147483647) {
      throw new Error(`Total WAV file size too large: ${totalBufferSize} bytes.`);
    }

    const buffer = new ArrayBuffer(totalBufferSize);
    const view = new DataView(buffer);

    // Write WAV header with bounds checking
    try {
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
    } catch (headerError) {
      throw new Error(`Failed to write WAV header: ${headerError instanceof Error ? headerError.message : 'Unknown error'}`);
    }

    // Extract channel data with bounds checking
    const channelData: Float32Array[] = [];
    try {
      for (let i = 0; i < numOfChannels; i++) {
        const channelBuffer = audioBuffer.getChannelData(i);
        if (!channelBuffer || channelBuffer.length !== length) {
          throw new Error(`Invalid channel data for channel ${i}: expected ${length} samples, got ${channelBuffer?.length || 0}`);
        }
        channelData.push(channelBuffer);
      }
    } catch (channelError) {
      throw new Error(`Failed to extract channel data: ${channelError instanceof Error ? channelError.message : 'Unknown error'}`);
    }

    // Write audio data with bounds checking
    let writeOffset = 44;
    try {
      for (let i = 0; i < length; i++) {
        // Check bounds for sample index
        if (i < 0 || i >= length) {
          throw new Error(`Sample index out of bounds: ${i} (length: ${length})`);
        }

        for (let channel = 0; channel < numOfChannels; channel++) {
          // Check bounds for channel index
          if (channel < 0 || channel >= numOfChannels) {
            throw new Error(`Channel index out of bounds: ${channel} (channels: ${numOfChannels})`);
          }

          // Check bounds for write offset
          if (writeOffset < 44 || writeOffset >= totalBufferSize - 1) {
            throw new Error(`Write offset out of bounds: ${writeOffset} (buffer size: ${totalBufferSize})`);
          }

          // Get sample with bounds checking
          let sample = channelData[channel][i];

          // Validate sample value
          if (typeof sample !== 'number' || isNaN(sample)) {
            console.warn(`Invalid sample at channel ${channel}, index ${i}: ${sample}, using 0`);
            sample = 0;
          }

          // Scale to 16-bit range (-32768 to 32767) with clamping
          sample = Math.max(-1, Math.min(1, sample));
          sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;

          // Ensure sample is within 16-bit integer range
          sample = Math.max(-32768, Math.min(32767, Math.round(sample)));

          view.setInt16(writeOffset, sample, true);
          writeOffset += 2;
        }

        // Progress logging for very long audio
        if (length > 1000000 && i % 100000 === 0) {
          console.log(`WAV conversion progress: ${((i / length) * 100).toFixed(1)}%`);
        }
      }
    } catch (writeError) {
      throw new Error(`Failed to write audio data: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
    }

    console.log(`Successfully converted AudioBuffer to WAV: ${(totalBufferSize / 1024 / 1024).toFixed(2)}MB`);

    return new Blob([buffer], { type: 'audio/wav' });
  } catch (error) {
    console.error('Error in audioBufferToWav:', error);
    throw new Error(`Failed to convert AudioBuffer to WAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Helper function to write a string to a DataView with bounds checking
 */
function writeString(view: DataView, offset: number, string: string): void {
  if (!view) {
    throw new Error('DataView is null or undefined');
  }

  if (typeof offset !== 'number' || offset < 0) {
    throw new Error(`Invalid offset: ${offset}. Must be a non-negative number.`);
  }

  if (typeof string !== 'string') {
    throw new Error(`Invalid string: ${string}. Must be a string.`);
  }

  if (offset + string.length > view.byteLength) {
    throw new Error(`String write would exceed buffer bounds: offset ${offset} + length ${string.length} > buffer size ${view.byteLength}`);
  }

  for (let i = 0; i < string.length; i++) {
    const charCode = string.charCodeAt(i);

    // Validate character code
    if (isNaN(charCode) || charCode < 0 || charCode > 255) {
      throw new Error(`Invalid character code at position ${i}: ${charCode}. Must be between 0 and 255.`);
    }

    view.setUint8(offset + i, charCode);
  }
}