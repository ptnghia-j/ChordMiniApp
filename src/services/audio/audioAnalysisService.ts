/**
 * Audio Analysis Orchestrator Service
 *
 * Coordinates chord recognition and beat detection, including large-file
 * handling with Vercel Blob uploads. Maintains existing signatures.
 */

import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

import { vercelBlobUploadService } from '@/services/storage/vercelBlobUploadService';
import { detectBeatsFromFile, detectBeatsWithRateLimit, detectBeatsFromFirebaseUrl } from '@/services/audio/beatDetectionService';
import { synchronizeChords } from '@/utils/chordSynchronization';
import { recognizeChordsWithRateLimit } from '@/services/chord-analysis/chordService';
import type { AnalysisResult, BeatInfo, ChordDetectorType, ChordDetectionResult, BeatDetectionBackendResponse } from '@/types/audioAnalysis';

import { getChordAnalysisWorker } from '@/workers/chordAnalysisClient';

function toBeatInfo(beatResults: BeatDetectionBackendResponse): BeatInfo[] {
  const beats: BeatInfo[] = [];
  if (Array.isArray(beatResults.beats)) {
    for (let index = 0; index < beatResults.beats.length; index++) {
      const time = beatResults.beats[index];
      if (typeof time !== 'number' || isNaN(time) || time < 0) continue;
      beats.push({
        time,
        strength: 0.8,
        beatNum: (index % (typeof beatResults.time_signature === 'number' ? beatResults.time_signature : 4)) + 1
      });
    }
  }
  return beats;
}

// Heuristic: reward chord changes that occur on downbeats and penalize changes off-downbeat
// This avoids bias toward shorter meters (e.g., 3) that can artificially increase changes when sampling.
function scoreDownbeatAlignment(chordSeries: string[], timeSignature: number): { score: number; bestShift: number } {
  if (!Array.isArray(chordSeries) || chordSeries.length < 2) return { score: 0, bestShift: 0 };
  const isValid = (c: string) => c && c !== '' && c !== 'N.C.' && c !== 'N/C' && c !== 'N';
  // changeAt[i] indicates a chord change occurs at beat i (from i-1 -> i) with valid chords
  const changeAt: boolean[] = new Array(chordSeries.length).fill(false);
  for (let i = 1; i < chordSeries.length; i++) {
    const prev = chordSeries[i - 1];
    const curr = chordSeries[i];
    if (isValid(prev as string) && isValid(curr as string) && prev !== curr) changeAt[i] = true;
  }

  let bestShift = 0;
  let bestScore = -Infinity;
  const onWeight = 2;   // reward for a change on a downbeat
  const offPenalty = 1; // penalty for a change off a downbeat

  for (let shift = 0; shift < timeSignature; shift++) {
    let onDown = 0;
    let offDown = 0;
    for (let i = 1; i < chordSeries.length; i++) {
      if (!changeAt[i]) continue;
      const isDownbeatPos = ((i - shift) % timeSignature + timeSignature) % timeSignature === 0;
      if (isDownbeatPos) onDown++; else offDown++;
    }
    const score = onDown * onWeight - offDown * offPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  return { score: bestScore === -Infinity ? 0 : bestScore, bestShift };
}

async function fetchFileFromUrl(url: string, videoId?: string): Promise<File> {
  // PRIORITY FIX: Check for cached complete audio file first (from parallel pipeline)
  if (videoId) {
    try {
      const { getCachedAudioFile } = await import('../api/parallelPipelineService');
      const cachedFile = getCachedAudioFile(videoId);

      if (cachedFile) {
        console.log(`🚀 Using cached complete audio file for analysis (${(cachedFile.size / 1024 / 1024).toFixed(2)}MB)`);

        // Convert Blob to File with proper name and type
        const fileName = `${videoId}.${cachedFile.type.includes('mp4') ? 'm4a' : 'mp3'}`;
        return new File([cachedFile], fileName, { type: cachedFile.type || 'audio/mpeg' });
      } else {
        console.log(`⚠️ No cached file found for ${videoId}, proceeding with URL fetch`);
      }
    } catch (cacheError) {
      console.warn(`⚠️ Cache lookup failed for ${videoId}:`, cacheError);
    }
  }

  // Fallback to URL-based fetching
  const encoded = url.includes('quicktube.app/dl/')
    ? encodeURIComponent(url).replace(/%5B/g, '[').replace(/%5D/g, ']')
    : encodeURIComponent(url);

  // Add videoId parameter if available for cache lookup
  const proxyUrl = videoId
    ? `/api/proxy-audio?url=${encoded}&videoId=${videoId}`
    : `/api/proxy-audio?url=${encoded}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) {
    if (response.status >= 500) throw new Error(`Backend service temporarily unavailable (${response.status}). Please try again later or use file upload.`);
    if (response.status === 413) throw new Error(`Audio file too large for processing (${response.status}). Try a shorter clip.`);
    if (response.status === 408 || response.status === 504) throw new Error(`Request timed out (${response.status}). Try again shortly.`);
    throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Audio file is empty or corrupted');
  if (blob.size > 100 * 1024 * 1024) throw new Error('Audio file is too large (>100MB). Please use a smaller file.');
  return new File([blob], 'audio.wav', { type: 'audio/wav' });
}

async function handleBlobPath(
  audioFile: File,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer',
  chordDetector: ChordDetectorType,
  audioDuration?: number
): Promise<AnalysisResult> {
  // Chords
  const chordBlob = await vercelBlobUploadService.recognizeChordsBlobUpload(audioFile, chordDetector);
  if (!chordBlob.success) {
    const err = chordBlob.error || 'Unknown blob upload error';
    throw new Error(`File too large for direct processing (${vercelBlobUploadService.getFileSizeString(audioFile.size)}). Blob upload failed: ${err}. Please try a smaller file or check your internet connection.`);
  }
  const chordResp = chordBlob.data as { success: boolean; chords?: ChordDetectionResult[] };
  if (!chordResp.chords || !Array.isArray(chordResp.chords)) {
    throw new Error('Invalid chord recognition response: chords array not found or not an array');
  }
  const chordResults = chordResp.chords as ChordDetectionResult[];

  // Beats
  let beatResults: BeatDetectionBackendResponse;
  try {
    const beatBlob = await vercelBlobUploadService.detectBeatsBlobUpload(audioFile, beatDetector);
    if (!beatBlob.success) {
      console.warn(`⚠️ Vercel Blob beat detection failed: ${beatBlob.error}, using empty beats array`);
      beatResults = { beats: [], bpm: undefined, time_signature: undefined, success: true } as BeatDetectionBackendResponse;
    } else {
      beatResults = beatBlob.data as BeatDetectionBackendResponse;

      // Normalize time_signature from string "6/4" to numeric 6 for production blob path
      const tsRaw = (beatResults as BeatDetectionBackendResponse).time_signature;
      const tsNum = typeof tsRaw === 'number' ? tsRaw
                  : (typeof tsRaw === 'string'
                     ? (tsRaw.includes('/') ? parseInt(tsRaw.split('/')[0], 10) : parseInt(tsRaw, 10))
                     : undefined);
      if (typeof tsNum === 'number' && !isNaN(tsNum)) {
        (beatResults as BeatDetectionBackendResponse).time_signature = tsNum; // ensure numeric for toBeatInfo and UI
      }

      if (!beatResults.beats || !Array.isArray(beatResults.beats)) {
        console.warn('⚠️ Invalid beat detection response from blob upload, using empty beats array');
        beatResults = { beats: [], bpm: undefined, time_signature: undefined, success: true } as BeatDetectionBackendResponse;
      }
    }
  } catch (e) {
    console.warn(`⚠️ Beat detection failed for blob upload: ${e}, using empty beats array`);
    beatResults = { beats: [], bpm: undefined, time_signature: undefined, success: true } as BeatDetectionBackendResponse;
  }

  // If backend provided dual downbeat candidates (Madmom), auto-select best (3/4 vs 4/4) using chord-change heuristic
  try {
    const candidates = beatResults.downbeat_candidates as Record<string, number[]> | undefined;
    if (candidates) {
      try {
        const worker = getChordAnalysisWorker();
        if (worker) {
          const result = await worker.chooseMeterAndDownbeats(
            chordResults,
            beatResults.beats as number[],
            candidates
          );
          beatResults.downbeats = result.downbeats;
          beatResults.time_signature = result.timeSignature;
          console.log(`Auto-selected meter (worker): → ${result.timeSignature}/4`);
        } else {
          const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
          const tempSync = synchronizeChords(chordResults, beatsForSync);
          const chordSeries = tempSync.map((s) => s.chord);
          const s3 = scoreDownbeatAlignment(chordSeries, 3);
          const s4 = scoreDownbeatAlignment(chordSeries, 4);
          const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
          beatResults.downbeats = candidates[String(winner)] || [];
          beatResults.time_signature = winner;
          console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
        }
      } catch (workerErr) {
        console.warn('Worker computation failed, using main thread fallback:', workerErr);
        const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
        const tempSync = synchronizeChords(chordResults, beatsForSync);
        const chordSeries = tempSync.map((s) => s.chord);
        const s3 = scoreDownbeatAlignment(chordSeries, 3);
        const s4 = scoreDownbeatAlignment(chordSeries, 4);
        const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
        beatResults.downbeats = candidates[String(winner)] || [];
        beatResults.time_signature = winner;
        console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
      }
    }
  } catch (selErr) {
    console.warn('Downbeat candidate selection (blob path) skipped due to error:', selErr);
  }

  const beats = toBeatInfo(beatResults);
  let synchronizedChords;
  try {
    const worker = getChordAnalysisWorker();
    if (worker) {
      synchronizedChords = await worker.synchronizeChords(chordResults, beats);
    } else {
      synchronizedChords = synchronizeChords(chordResults, beats);
    }
    if (!synchronizedChords || !Array.isArray(synchronizedChords)) throw new Error('Chord synchronization failed: invalid result format');
  } catch (e) {
    console.error('Error in blob API chord synchronization:', e);
    synchronizedChords = beats.map((_, index) => ({ chord: 'N/C', beatIndex: index }));
  }

  return {
    chords: chordResults,
    beats,
    downbeats: beatResults.downbeats || [],
    downbeats_with_measures: [],
    synchronizedChords,
    chordModel: chordDetector,
    beatModel: beatDetector,
    audioDuration,
    beatDetectionResult: {
      time_signature: typeof beatResults.time_signature === 'number' ? beatResults.time_signature : undefined,
      bpm: typeof beatResults.bpm === 'number' ? beatResults.bpm : (typeof (beatResults as unknown as { BPM?: number }).BPM === 'number' ? (beatResults as unknown as { BPM?: number }).BPM : undefined),
      beatShift: 0
    }
  };
}

export async function analyzeAudioWithRateLimit(
  audioInput: File | AudioBuffer | string,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  chordDetector: ChordDetectorType = 'chord-cnn-lstm',
  videoId?: string
): Promise<AnalysisResult> {
  const { isLocalBackend } = await import('@/utils/backendConfig');
  const isLocalhost = isLocalBackend();

  let audioFile: File;
  let audioDuration: number | undefined;

  if (audioInput instanceof File) {
    if (audioInput.size === 0) throw new Error('Audio file is empty or corrupted');
    if (audioInput.size > 100 * 1024 * 1024) throw new Error('Audio file is too large (>100MB). Please use a smaller file.');
    audioFile = audioInput;
    try { audioDuration = await getAudioDurationFromFile(audioFile); } catch (e) { console.warn(`⚠️ Could not detect audio duration: ${e}`); }
    if (vercelBlobUploadService.shouldUseBlobUpload(audioFile.size)) {
      return handleBlobPath(audioFile, beatDetector, chordDetector, audioDuration);
    }
  } else if (typeof audioInput === 'string') {
    audioFile = await fetchFileFromUrl(audioInput, videoId);
    try { audioDuration = await getAudioDurationFromFile(audioFile); } catch (e) { console.warn(`⚠️ Could not detect audio duration: ${e}`); }
    if (vercelBlobUploadService.shouldUseBlobUpload(audioFile.size)) {
      return handleBlobPath(audioFile, beatDetector, chordDetector, audioDuration);
    }
  } else if (audioInput instanceof AudioBuffer) {
    if (!audioInput || audioInput.length === 0) throw new Error('AudioBuffer is empty or invalid');
    if (audioInput.duration === 0) throw new Error('AudioBuffer has zero duration');
    if (audioInput.duration > 300) throw new Error('Audio duration exceeds maximum supported length (5 minutes).');
    if (audioInput.sampleRate < 8000 || audioInput.sampleRate > 192000) throw new Error(`Unsupported sample rate: ${audioInput.sampleRate}Hz. Supported range: 8kHz-192kHz`);
    const { audioBufferToWav } = await import('@/utils/audioBufferUtils');
    const blob = await audioBufferToWav(audioInput);
    audioFile = new File([blob], 'audio.wav', { type: 'audio/wav' });
    audioDuration = audioInput.duration;
  } else {
    throw new Error('Invalid audio input: must be either File object, AudioBuffer, or URL string');
  }

  // PERFORMANCE OPTIMIZATION: Parallelize beat detection and chord recognition
  // These operations are independent and can run simultaneously, reducing total processing time.
  const [beatResults, chordResults] = await Promise.all([
    // Beat detection (rate limited path)
    (async (): Promise<BeatDetectionBackendResponse> => {
      try {
        let results: BeatDetectionBackendResponse;

        if (isLocalhost && typeof audioInput === 'string' && audioInput.includes('firebasestorage.googleapis.com')) {
          results = await detectBeatsFromFirebaseUrl(audioInput, beatDetector, videoId);
        } else {
          results = await detectBeatsWithRateLimit(audioFile, beatDetector);
        }

        if (!results || !results.beats) throw new Error('Beat detection failed: missing beats data');
        if (!Array.isArray(results.beats)) throw new Error('Invalid beat detection results: beats is not an array');
        if (results.beats.length === 0) throw new Error('No beats detected in the audio. The audio may be too quiet, too short, or not contain rhythmic content.');
        // filter invalid
        results.beats = results.beats.filter((t: number) => typeof t === 'number' && !isNaN(t) && t >= 0 && t <= 3600);
        if (results.beats.length === 0) throw new Error('All detected beats have invalid timestamps');
        return results;
      } catch (e) {
        console.error('Error in beat detection with rate limiting:', e);
        if (e instanceof Error) {
          if (e.message.includes('Rate limited')) throw new Error(`Beat detection rate limited: ${e.message}`);
          if (e.message.includes('too large')) throw new Error('Audio file is too large for beat detection. Try a shorter clip or the madmom detector.');
          if (e.message.includes('413')) throw new Error('Audio file size exceeds server limits. Please use a smaller file or try the madmom detector.');
          if (e.message.includes('timeout')) throw new Error('Beat detection timed out. Try a shorter clip or the madmom detector.');
          throw new Error(`Beat detection failed: ${e.message}`);
        }
        throw new Error(`Beat detection failed: ${String(e) || 'Unknown error'}`);
      }
    })(),

    // Chord recognition (rate limited path)
    (async (): Promise<ChordDetectionResult[]> => {
      try {
        let results = await recognizeChordsWithRateLimit(audioFile, chordDetector);
        // filter invalid chords
        results = results.filter(c => c && typeof c.start === 'number' && typeof c.end === 'number' && !isNaN(c.start) && !isNaN(c.end) && c.start >= 0 && c.end >= 0 && c.start < c.end && c.end <= 3600);
        return results;
      } catch (e) {
        console.error('Error in chord recognition with rate limiting:', e);
        if (e instanceof Error) {
          if (e.message.includes('Rate limited')) throw new Error(`Chord recognition rate limited: ${e.message}`);
          if (e.message.includes('too large')) throw new Error('Audio file is too large for chord recognition. Try a shorter clip.');
          if (e.message.includes('413')) throw new Error('Audio file size exceeds server limits for chord recognition. Please use a smaller file.');
          if (e.message.includes('timeout')) throw new Error('Chord recognition timed out. Try a shorter clip.');
          throw new Error(`Chord recognition failed: ${e.message}`);
        }
        throw new Error('Chord recognition failed with unknown error');
      }
    })()
  ]);

// Auto-select downbeats (3/4 vs 4/4) if candidates provided (Madmom)
try {
  const candidates = beatResults.downbeat_candidates as Record<string, number[]> | undefined;
  if (candidates) {
    try {
      const worker = getChordAnalysisWorker();
      if (worker) {
        const result = await worker.chooseMeterAndDownbeats(
          chordResults,
          beatResults.beats as number[],
          candidates
        );
        beatResults.downbeats = result.downbeats;
        beatResults.time_signature = result.timeSignature;
        console.log(`Auto-selected meter (worker): → ${result.timeSignature}/4`);
      } else {
        const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
        const tempSync = synchronizeChords(chordResults, beatsForSync);
        const chordSeries = tempSync.map((s) => s.chord);
        const s3 = scoreDownbeatAlignment(chordSeries, 3);
        const s4 = scoreDownbeatAlignment(chordSeries, 4);
        const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
        beatResults.downbeats = candidates[String(winner)] || beatResults.downbeats || [];
        beatResults.time_signature = winner;
        console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
      }
    } catch (workerErr) {
      console.warn('Worker computation failed, using main thread fallback:', workerErr);
      const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
      const tempSync = synchronizeChords(chordResults, beatsForSync);
      const chordSeries = tempSync.map((s) => s.chord);
      const s3 = scoreDownbeatAlignment(chordSeries, 3);
      const s4 = scoreDownbeatAlignment(chordSeries, 4);
      const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
      beatResults.downbeats = candidates[String(winner)] || beatResults.downbeats || [];
      beatResults.time_signature = winner;
      console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
    }
  }
} catch (selErr) {
  console.warn('Downbeat candidate selection skipped due to error:', selErr);
}

  const beats = toBeatInfo(beatResults);

  // Synchronize
  let synchronizedChords: { chord: string; beatIndex: number }[];
  try {
    const worker = getChordAnalysisWorker();
    if (worker) {
      synchronizedChords = await worker.synchronizeChords(chordResults, beats);
    } else {
      synchronizedChords = synchronizeChords(chordResults, beats) as { chord: string; beatIndex: number }[];
    }
  } catch (e) {
    console.warn('Worker sync failed, using main thread fallback:', e);
    synchronizedChords = synchronizeChords(chordResults, beats) as { chord: string; beatIndex: number }[];
  }
  synchronizedChords = synchronizedChords.filter((sc) => sc && typeof sc.beatIndex === 'number' && !isNaN(sc.beatIndex) && sc.beatIndex >= 0 && sc.beatIndex < beats.length && typeof (sc as { chord?: string }).chord === 'string');

  return {
    chords: chordResults,
    beats,
    downbeats: beatResults.downbeats,
    synchronizedChords,
    beatModel: (beatResults as unknown as { model?: string }).model,
    chordModel: chordDetector,
    audioDuration,
    beatDetectionResult: {
      time_signature: typeof beatResults.time_signature === 'number' ? beatResults.time_signature : undefined,
      bpm: beatResults.bpm
    }
  };


}

export async function analyzeAudio(
  audioInput: AudioBuffer | string,
  beatDetector: 'auto' | 'madmom' | 'beat-transformer' = 'beat-transformer',
  chordDetector: ChordDetectorType = 'chord-cnn-lstm',
  videoId?: string
): Promise<AnalysisResult> {
  const { isLocalBackend } = await import('@/utils/backendConfig');
  const isLocalhost = isLocalBackend();

  let audioFile: File;
  let audioDuration: number | undefined;

  if (typeof audioInput === 'string') {
    audioFile = await fetchFileFromUrl(audioInput, videoId);
    // Only detect duration client-side (browser) - server-side (Docker) doesn't have Audio API
    if (typeof window !== 'undefined') {
      try {
        audioDuration = await getAudioDurationFromFile(audioFile);
      } catch (e) {
        console.debug(`Could not detect audio duration (client-side): ${e}`);
      }
    }
  } else if (audioInput instanceof AudioBuffer) {
    if (!audioInput || audioInput.length === 0) throw new Error('AudioBuffer is empty or invalid');
    if (audioInput.duration === 0) throw new Error('AudioBuffer has zero duration');
    if (audioInput.duration > 300) throw new Error('Audio duration exceeds maximum supported length (5 minutes).');
    if (audioInput.sampleRate < 8000 || audioInput.sampleRate > 192000) throw new Error(`Unsupported sample rate: ${audioInput.sampleRate}Hz. Supported range: 8kHz-192kHz`);
    const { audioBufferToWav } = await import('@/utils/audioBufferUtils');
    const blob = await audioBufferToWav(audioInput);
    audioFile = new File([blob], 'audio.wav', { type: 'audio/wav' });
    audioDuration = audioInput.duration;
  } else {
    throw new Error('Invalid audio input: must be either AudioBuffer or URL string');
  }

  console.log(`Detecting beats using ${beatDetector} model...`);
  let beatResults: BeatDetectionBackendResponse;
  try {
    if (isLocalhost && typeof audioInput === 'string' && audioInput.includes('firebasestorage.googleapis.com')) {
      beatResults = await detectBeatsFromFirebaseUrl(audioInput, beatDetector, videoId);
    } else {
      beatResults = await detectBeatsFromFile(audioFile, beatDetector);
    }
    if (!beatResults || !beatResults.success) throw new Error(`Beat detection failed: ${beatResults?.error || 'Unknown error from beat detection service'}`);
    if (!beatResults.beats || !Array.isArray(beatResults.beats)) throw new Error('Invalid beat detection results: missing or invalid beats array');
    if (beatResults.beats.length === 0) throw new Error('No beats detected in the audio. The audio may be too quiet, too short, or not contain rhythmic content.');
    // filter invalid
    beatResults.beats = beatResults.beats.filter((t: number) => typeof t === 'number' && !isNaN(t) && t >= 0 && t <= 3600);
    if (beatResults.beats.length === 0) throw new Error('All detected beats have invalid timestamps');
  } catch (e) {
    console.error('Error in beat detection:', e);
    if (e instanceof Error) {
      if (e.message.includes('too large')) throw new Error('Audio file is too large for beat detection. Try a shorter clip or the madmom detector.');
      if (e.message.includes('413')) throw new Error('Audio file size exceeds server limits. Please use a smaller file or try the madmom detector.');
      if (e.message.includes('timeout')) throw new Error('Beat detection timed out. Try a shorter clip or the madmom detector.');
      throw new Error(`Beat detection failed: ${e.message}`);
    }
    throw new Error('Beat detection failed with unknown error');
  }
// (beats will be computed after chordResults so we can evaluate candidates with chord context)


  // Chords
  let chordResults: ChordDetectionResult[];
  try {
    chordResults = await recognizeChordsWithRateLimit(audioFile, chordDetector);
    // filter invalid chords
    chordResults = chordResults.filter(c => c && typeof c.start === 'number' && typeof c.end === 'number' && !isNaN(c.start) && !isNaN(c.end) && c.start >= 0 && c.end >= 0 && c.start < c.end && c.end <= 3600);
  } catch (e) {
    console.error('Error in chord recognition:', e);
    if (e instanceof Error) {
      if (e.message.includes('too large')) throw new Error('Audio file is too large for chord recognition. Try a shorter clip.');
      if (e.message.includes('413')) throw new Error('Audio file size exceeds server limits for chord recognition. Please use a smaller file.');
      if (e.message.includes('timeout')) throw new Error('Chord recognition timed out. Try a shorter clip.');
      throw new Error(`Chord recognition failed: ${e.message}`);
    }
    throw new Error('Chord recognition failed with unknown error');
  }

  // Auto-select downbeats (3/4 vs 4/4) if candidates provided (Madmom)
  try {
    const candidates = beatResults.downbeat_candidates as Record<string, number[]> | undefined;
    if (candidates) {
      try {
        const worker = getChordAnalysisWorker();
        if (worker) {
          const result = await worker.chooseMeterAndDownbeats(
            chordResults,
            beatResults.beats as number[],
            candidates
          );
          beatResults.downbeats = result.downbeats;
          beatResults.time_signature = result.timeSignature;
          console.log(`Auto-selected meter (worker): → ${result.timeSignature}/4`);
        } else {
          const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
          const tempSync = synchronizeChords(chordResults, beatsForSync);
          const chordSeries = tempSync.map((s) => s.chord);
          const s3 = scoreDownbeatAlignment(chordSeries, 3);
          const s4 = scoreDownbeatAlignment(chordSeries, 4);
          const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
          beatResults.downbeats = candidates[String(winner)] || beatResults.downbeats || [];
          beatResults.time_signature = winner;
          console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
        }
      } catch (workerErr) {
        console.warn('Worker computation failed, using main thread fallback:', workerErr);
        const beatsForSync: BeatInfo[] = (beatResults.beats as number[]).map((t) => ({ time: t, strength: 0.8 }));
        const tempSync = synchronizeChords(chordResults, beatsForSync);
        const chordSeries = tempSync.map((s) => s.chord);
        const s3 = scoreDownbeatAlignment(chordSeries, 3);
        const s4 = scoreDownbeatAlignment(chordSeries, 4);
        const winner: 3 | 4 = s3.score > s4.score ? 3 : 4;
        beatResults.downbeats = candidates[String(winner)] || beatResults.downbeats || [];
        beatResults.time_signature = winner;
        console.log(`Auto-selected meter (main thread fallback): → ${winner}/4`);
      }
    }
  } catch (selErr) {
    console.warn('Downbeat candidate selection skipped due to error:', selErr);
  }

  const beats = toBeatInfo(beatResults);

  // Synchronize
  let synchronizedChords: { chord: string; beatIndex: number }[];
  try {
    const worker = getChordAnalysisWorker();
    if (worker) {
      synchronizedChords = await worker.synchronizeChords(chordResults, beats);
    } else {
      synchronizedChords = synchronizeChords(chordResults, beats) as { chord: string; beatIndex: number }[];
    }
  } catch (e) {
    console.warn('Worker sync failed, using main thread fallback:', e);
    synchronizedChords = synchronizeChords(chordResults, beats) as { chord: string; beatIndex: number }[];
  }

  return {
    chords: chordResults,
    beats,
    downbeats: beatResults.downbeats,
    synchronizedChords,
    beatModel: (beatResults as unknown as { model?: string }).model,
    chordModel: chordDetector,
    audioDuration,
    beatDetectionResult: {
      time_signature: typeof beatResults.time_signature === 'number' ? beatResults.time_signature : undefined,
      bpm: beatResults.bpm
    }
  };
}


