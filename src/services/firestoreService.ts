import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ChordDetectionResult } from './chordRecognitionService';
import { BeatInfo } from './beatDetectionService';

// Define the transcription data structure
export interface TranscriptionData {
  videoId: string;
  beatModel: string;
  chordModel: string;
  beats: BeatInfo[];
  chords: ChordDetectionResult[];
  downbeats?: number[];
  downbeats_with_measures?: { time: number; measureNum: number }[];
  synchronizedChords: { chord: string; beatIndex: number; beatNum?: number }[];
  createdAt: Timestamp;
  audioDuration?: number;
  totalProcessingTime?: number;
  // Add time signature and BPM fields
  timeSignature?: number;
  bpm?: number;
  // Add beat shift field for synchronization
  beatShift?: number;
  // Add key signature field
  keySignature?: string;
  keyModulation?: string;
}

// Collection name
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

/**
 * Check if a transcription exists in the database
 * @param videoId YouTube video ID
 * @param beatModel Beat detection model name
 * @param chordModel Chord detection model name
 * @returns The transcription data if found, null otherwise
 */
export async function getTranscription(
  videoId: string,
  beatModel: string,
  chordModel: string
): Promise<TranscriptionData | null> {
  // Check if Firebase is initialized
  if (!db) {
    console.warn('Firebase not initialized, skipping transcription retrieval');
    return null;
  }

  try {
    console.log(`Checking for cached transcription: videoId=${videoId}, beatModel=${beatModel}, chordModel=${chordModel}`);

    // Create a unique document ID based on the parameters
    const docId = `${videoId}_${beatModel}_${chordModel}`;

    // Get the document reference
    const docRef = doc(db, TRANSCRIPTIONS_COLLECTION, docId);

    // Get the document
    const docSnap = await getDoc(docRef);

    // Check if the document exists
    if (docSnap.exists()) {
      const data = docSnap.data() as TranscriptionData;
      console.log('Found cached transcription in Firestore:', {
        videoId: data.videoId,
        timeSignature: data.timeSignature,
        bpm: data.bpm,
        hasTimeSignature: data.timeSignature !== undefined,
        hasBpm: data.bpm !== undefined
      });
      return data;
    }

    console.log('No cached transcription found in Firestore');
    return null;
  } catch (error) {
    console.error('Error getting transcription from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

/**
 * Save a transcription to the database
 * @param transcriptionData The transcription data to save
 * @returns True if successful, false otherwise
 */
export async function saveTranscription(
  transcriptionData: Omit<TranscriptionData, 'createdAt'>
): Promise<boolean> {
  // Check if Firebase is initialized
  if (!db) {
    console.warn('Firebase not initialized, skipping transcription save');
    return false;
  }

  try {
    console.log('Saving transcription to Firestore:', {
      videoId: transcriptionData.videoId,
      beatModel: transcriptionData.beatModel,
      chordModel: transcriptionData.chordModel,
      beatsCount: transcriptionData.beats?.length,
      chordsCount: transcriptionData.chords?.length,
      timeSignature: transcriptionData.timeSignature,
      bpm: transcriptionData.bpm
    });

    // Create a unique document ID based on the parameters
    const docId = `${transcriptionData.videoId}_${transcriptionData.beatModel}_${transcriptionData.chordModel}`;

    // Get the document reference
    const docRef = doc(db, TRANSCRIPTIONS_COLLECTION, docId);

    // Prepare data for Firestore
    // Convert any complex objects to a format Firestore can handle
    const sanitizedData = {
      videoId: transcriptionData.videoId,
      beatModel: transcriptionData.beatModel,
      chordModel: transcriptionData.chordModel,
      beats: transcriptionData.beats.map(beat => ({
        time: beat.time,
        strength: beat.strength || 0,
        beatNum: beat.beatNum || 0
      })),
      chords: transcriptionData.chords.map(chord => ({
        chord: chord.chord,
        start: chord.start,
        end: chord.end,
        confidence: chord.confidence
      })),
      downbeats: transcriptionData.downbeats || [],
      downbeats_with_measures: transcriptionData.downbeats_with_measures
        ? transcriptionData.downbeats_with_measures.map(d => ({
            time: d.time,
            measureNum: d.measureNum
          }))
        : [],
      synchronizedChords: transcriptionData.synchronizedChords.map(sc => ({
        chord: sc.chord,
        beatIndex: sc.beatIndex,
        beatNum: sc.beatNum || 0,
        source: sc.source || 'detected' // Preserve source field for timing compensation
      })),
      audioDuration: transcriptionData.audioDuration || 0,
      totalProcessingTime: transcriptionData.totalProcessingTime || 0,
      // Include time signature and BPM fields - these were missing!
      timeSignature: transcriptionData.timeSignature,
      bpm: transcriptionData.bpm,
      // Include beat shift for synchronization (handle undefined)
      beatShift: transcriptionData.beatShift ?? 0,
      // Include key signature fields (handle undefined)
      keySignature: transcriptionData.keySignature ?? null,
      keyModulation: transcriptionData.keyModulation ?? null,
      createdAt: serverTimestamp()
    };

    // Save the document
    await setDoc(docRef, sanitizedData);

    console.log('Transcription saved successfully to Firestore');
    return true;
  } catch (error) {
    console.error('Error saving transcription to Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return false;
  }
}

/**
 * Get all transcriptions for a specific video
 * @param videoId YouTube video ID
 * @returns Array of transcription data
 */
export async function getVideoTranscriptions(
  videoId: string
): Promise<TranscriptionData[]> {
  // Check if Firebase is initialized
  if (!db) {
    console.warn('Firebase not initialized, skipping video transcriptions retrieval');
    return [];
  }

  try {
    console.log(`Getting all transcriptions for video: ${videoId}`);

    // Create a query to get all transcriptions for the video
    const q = query(
      collection(db, TRANSCRIPTIONS_COLLECTION),
      where('videoId', '==', videoId)
    );

    // Get the documents
    const querySnapshot = await getDocs(q);

    // Convert the documents to TranscriptionData objects
    const transcriptions: TranscriptionData[] = [];
    querySnapshot.forEach((docSnap) => {
      transcriptions.push(docSnap.data() as TranscriptionData);
    });

    console.log(`Found ${transcriptions.length} transcriptions for video ${videoId}`);
    return transcriptions;
  } catch (error) {
    console.error('Error getting video transcriptions from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
}
