import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/config/firebase';
import { ChordDetectionResult } from './chordRecognitionService';
import { BeatInfo } from './beatDetectionService';

// Extended interface for synchronized chords that may have additional properties
interface ExtendedSynchronizedChord {
  chord: string;
  beatIndex: number;
  beatNum?: number;
  source?: string;
}

// Define the transcription data structure
export interface TranscriptionData {
  videoId: string;
  title?: string; // Video title field for proper display in RecentVideos
  channelTitle?: string; // FIXED: Add channel title for complete metadata
  thumbnail?: string; // FIXED: Add thumbnail URL for complete metadata
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
  timeSignature?: number | null;
  bpm?: number | null;
  // Add beat shift field for synchronization
  beatShift?: number;
  // Add key signature field
  keySignature?: string | null;
  keyModulation?: string | null;
  // Add enharmonic correction fields
  originalChords?: string[] | null;
  correctedChords?: string[] | null;
  chordCorrections?: Record<string, string> | null;
  // Add Roman numeral analysis field
  romanNumerals?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
}

// Collection name
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

// Flag to disable Firestore if CORS errors persist
let firestoreDisabled = false;

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
  // Check if Firebase is initialized or disabled due to CORS issues
  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('Firestore disabled due to CORS issues, skipping transcription retrieval');
    } else {
      console.warn('Firebase not initialized, skipping transcription retrieval');
    }
    return null;
  }

  try {
    // console.log(`Checking for cached transcription: videoId=${videoId}, beatModel=${beatModel}, chordModel=${chordModel}`);

    // Create a unique document ID based on the parameters
    const docId = `${videoId}_${beatModel}_${chordModel}`;

    // Get the document reference
    const docRef = doc(db, TRANSCRIPTIONS_COLLECTION, docId);

    // Get the document
    const docSnap = await getDoc(docRef);

    // Check if the document exists
    if (docSnap.exists()) {
      const data = docSnap.data() as TranscriptionData;
      // console.log('Found cached transcription in Firestore:', {
      //   videoId: data.videoId,
      //   timeSignature: data.timeSignature,
      //   bpm: data.bpm,
      //   hasTimeSignature: data.timeSignature !== undefined,
      //   hasBpm: data.bpm !== undefined
      // });
      return data;
    }

    // console.log('No cached transcription found in Firestore');
    return null;
  } catch (error) {
    console.error('Error getting transcription from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      // Check for CORS or network errors and handle gracefully
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('Network/CORS error accessing Firestore - disabling Firestore for this session');
        firestoreDisabled = true;
      }
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
  // console.log('🚀 STARTING TRANSCRIPTION SAVE PROCESS');

  // Check if Firebase is initialized or disabled due to CORS issues
  // console.log('🔍 FIREBASE INITIALIZATION CHECK:', {
  //   dbExists: !!db,
  //   authExists: !!auth,
  //   firestoreDisabled,
  //   dbType: typeof db,
  //   authType: typeof auth
  // });

  if (!db || !auth || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('❌ Firestore disabled due to CORS issues, skipping transcription save');
    } else if (!db) {
      console.warn('❌ Firebase Firestore not initialized, skipping transcription save');
    } else if (!auth) {
      console.warn('❌ Firebase Auth not initialized, skipping transcription save');
    }
    return false;
  }

  // Wait for authentication to be ready
  return new Promise((resolve) => {

    const unsubscribe = onAuthStateChanged(auth!, async (user) => {
      unsubscribe(); // Clean up the listener

      if (!user) {
        console.error('❌ User not authenticated, cannot save to Firestore');
        console.error('❌ Authentication required for Firestore operations');
        resolve(false);
        return;
      }

      const result = await performFirestoreSave(transcriptionData);
      resolve(result);
    });

    // Add a timeout to prevent hanging
    setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, 10000);
  });
}

/**
 * Internal function to perform the actual Firestore save operation
 * @param transcriptionData The transcription data to save
 * @returns True if successful, false otherwise
 */
async function performFirestoreSave(
  transcriptionData: Omit<TranscriptionData, 'createdAt'>
): Promise<boolean> {

  try {
    // console.log('🔄 Starting authenticated Firestore save process...');
    // console.log('🔍 DETAILED TRANSCRIPTION INPUT DATA:', {
    //   videoId: transcriptionData.videoId,
    //   videoIdType: typeof transcriptionData.videoId,
    //   videoIdLength: transcriptionData.videoId?.length,
    //   beatModel: transcriptionData.beatModel,
    //   beatModelType: typeof transcriptionData.beatModel,
    //   chordModel: transcriptionData.chordModel,
    //   chordModelType: typeof transcriptionData.chordModel,
    //   beatsCount: transcriptionData.beats?.length,
    //   beatsType: typeof transcriptionData.beats,
    //   chordsCount: transcriptionData.chords?.length,
    //   chordsType: typeof transcriptionData.chords,
    //   synchronizedChordsCount: transcriptionData.synchronizedChords?.length,
    //   synchronizedChordsType: typeof transcriptionData.synchronizedChords,
    //   timeSignature: transcriptionData.timeSignature,
    //   timeSignatureType: typeof transcriptionData.timeSignature,
    //   bpm: transcriptionData.bpm,
    //   bpmType: typeof transcriptionData.bpm,
    //   hasDownbeats: !!transcriptionData.downbeats,
    //   hasDownbeatsWithMeasures: !!transcriptionData.downbeats_with_measures,
    //   hasAudioDuration: !!transcriptionData.audioDuration,
    //   hasTotalProcessingTime: !!transcriptionData.totalProcessingTime,
    //   hasBeatShift: transcriptionData.beatShift !== undefined,
    //   hasKeySignature: transcriptionData.keySignature !== undefined,
    //   hasKeyModulation: transcriptionData.keyModulation !== undefined,
    //   hasOriginalChords: transcriptionData.originalChords !== undefined,
    //   hasCorrectedChords: transcriptionData.correctedChords !== undefined,
    //   hasChordCorrections: transcriptionData.chordCorrections !== undefined,
    //   totalInputFields: Object.keys(transcriptionData).length
    // });

    // Create a unique document ID based on the parameters
    const docId = `${transcriptionData.videoId}_${transcriptionData.beatModel}_${transcriptionData.chordModel}`;

    // Document ID created and validated

    // Get the document reference
    // console.log('📂 Creating document reference for collection:', TRANSCRIPTIONS_COLLECTION);
    // console.log('📂 Firebase db instance:', {
    //   dbExists: !!db,
    //   dbType: typeof db,
    //   collectionName: TRANSCRIPTIONS_COLLECTION
    // });

    const docRef = doc(db!, TRANSCRIPTIONS_COLLECTION, docId);

    // Document reference created successfully

    // Prepare data for Firestore
    // console.log('🧹 Starting data sanitization process...');

    // First, let's validate the input arrays
    // console.log('🔍 ARRAY VALIDATION:', {
    //   beatsIsArray: Array.isArray(transcriptionData.beats),
    //   beatsLength: transcriptionData.beats?.length || 0,
    //   chordsIsArray: Array.isArray(transcriptionData.chords),
    //   chordsLength: transcriptionData.chords?.length || 0,
    //   synchronizedChordsIsArray: Array.isArray(transcriptionData.synchronizedChords),
    //   synchronizedChordsLength: transcriptionData.synchronizedChords?.length || 0,
    //   firstBeat: transcriptionData.beats?.[0],
    //   firstChord: transcriptionData.chords?.[0],
    //   firstSyncChord: transcriptionData.synchronizedChords?.[0]
    // });

    // Convert any complex objects to a format Firestore can handle
    const sanitizedData = {
      videoId: transcriptionData.videoId,
      title: transcriptionData.title || null, // Include video title for proper display
      beatModel: transcriptionData.beatModel,
      chordModel: transcriptionData.chordModel,
      beats: transcriptionData.beats.map((beat) => {
        // console.log(`🔍 Processing beat ${index}:`, beat);
        return {
          time: beat.time,
          strength: beat.strength || 0,
          beatNum: beat.beatNum || 0
        };
      }),
      chords: transcriptionData.chords.map((chord) => {
        // console.log(`🔍 Processing chord ${index}:`, chord);
        return {
          chord: chord.chord,
          start: chord.start,
          end: chord.end,
          confidence: chord.confidence
        };
      }),
      downbeats: transcriptionData.downbeats || [],
      downbeats_with_measures: transcriptionData.downbeats_with_measures
        ? transcriptionData.downbeats_with_measures.map((d) => {
            // console.log(`🔍 Processing downbeat with measure ${index}:`, d);
            return {
              time: d.time,
              measureNum: d.measureNum
            };
          })
        : [],
      synchronizedChords: transcriptionData.synchronizedChords.map((sc) => {
        // console.log(`🔍 Processing synchronized chord ${index}:`, sc);
        return {
          chord: sc.chord,
          beatIndex: sc.beatIndex,
          beatNum: sc.beatNum || 0,
          source: (sc as ExtendedSynchronizedChord).source || 'detected' // Preserve source field for timing compensation
        };
      }),
      audioDuration: transcriptionData.audioDuration || 0,
      totalProcessingTime: transcriptionData.totalProcessingTime || 0,
      // Include time signature and BPM fields - handle undefined values
      timeSignature: transcriptionData.timeSignature ?? null,
      bpm: transcriptionData.bpm ?? null,
      // Include beat shift for synchronization (handle undefined)
      beatShift: transcriptionData.beatShift ?? 0,
      // Include key signature fields (handle undefined)
      keySignature: transcriptionData.keySignature ?? null,
      keyModulation: transcriptionData.keyModulation ?? null,
      // Include enharmonic correction fields (handle undefined)
      originalChords: transcriptionData.originalChords ?? null,
      correctedChords: transcriptionData.correctedChords ?? null,
      createdAt: Timestamp.now()
    };

    // console.log('🔍 SANITIZED DATA STRUCTURE:', {
    //   totalFields: Object.keys(sanitizedData).length,
    //   fieldNames: Object.keys(sanitizedData),
    //   videoId: sanitizedData.videoId,
    //   videoIdValid: typeof sanitizedData.videoId === 'string' && sanitizedData.videoId.length === 11,
    //   beatModel: sanitizedData.beatModel,
    //   beatModelValid: typeof sanitizedData.beatModel === 'string' && sanitizedData.beatModel.length > 0,
    //   chordModel: sanitizedData.chordModel,
    //   chordModelValid: typeof sanitizedData.chordModel === 'string' && sanitizedData.chordModel.length > 0,
    //   beatsCount: sanitizedData.beats.length,
    //   beatsValid: Array.isArray(sanitizedData.beats),
    //   chordsCount: sanitizedData.chords.length,
    //   chordsValid: Array.isArray(sanitizedData.chords),
    //   synchronizedChordsCount: sanitizedData.synchronizedChords.length,
    //   synchronizedChordsValid: Array.isArray(sanitizedData.synchronizedChords),
    //   createdAtType: typeof sanitizedData.createdAt,
    //   createdAtValid: sanitizedData.createdAt instanceof Timestamp
    // });

    // Final validation before saving
    // const requiredFields = ['videoId', 'beatModel', 'chordModel', 'beats', 'chords', 'synchronizedChords', 'createdAt'];
    // const hasAllRequiredFields = requiredFields.every(field => field in sanitizedData);
    // const missingFields = requiredFields.filter(field => !(field in sanitizedData));

    // console.log('🔍 FINAL VALIDATION BEFORE SAVE:', {
    //   docId,
    //   docIdLength: docId.length,
    //   videoId: sanitizedData.videoId,
    //   videoIdLength: sanitizedData.videoId.length,
    //   videoIdMatches11Chars: sanitizedData.videoId.length === 11,
    //   videoIdRegexMatch: /^[a-zA-Z0-9_-]+$/.test(sanitizedData.videoId),
    //   beatModel: sanitizedData.beatModel,
    //   beatModelLength: sanitizedData.beatModel.length,
    //   chordModel: sanitizedData.chordModel,
    //   chordModelLength: sanitizedData.chordModel.length,
    //   fieldCount: Object.keys(sanitizedData).length,
    //   hasAllRequiredFields,
    //   missingFields,
    //   createdAtType: typeof sanitizedData.createdAt,
    //   createdAtValue: sanitizedData.createdAt,
    //   createdAtIsTimestamp: sanitizedData.createdAt instanceof Timestamp,
    //   // Check if data size is within limits
    //   dataSizeCheck: Object.keys(sanitizedData).length <= 50,
    //   // Validate each required field type
    //   videoIdIsString: typeof sanitizedData.videoId === 'string',
    //   beatModelIsString: typeof sanitizedData.beatModel === 'string',
    //   chordModelIsString: typeof sanitizedData.chordModel === 'string',
    //   beatsIsArray: Array.isArray(sanitizedData.beats),
    //   chordsIsArray: Array.isArray(sanitizedData.chords),
    //   synchronizedChordsIsArray: Array.isArray(sanitizedData.synchronizedChords)
    // });

    // Save the document

    await setDoc(docRef, sanitizedData);


    return true;
  } catch (error) {
    // Enhanced error logging for debugging
    console.error('❌ FIRESTORE SAVE ERROR - COMPREHENSIVE DEBUGGING:', error);

    if (error instanceof Error) {
      console.error('🔍 ERROR ANALYSIS:', {
        errorType: error.constructor.name,
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 1000), // More stack trace for debugging
        // Check for specific error patterns
        isPermissionError: error.message.includes('Missing or insufficient permissions'),
        isNetworkError: error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'),
        isValidationError: error.message.includes('Invalid document'),
        isQuotaError: error.message.includes('quota'),
        isAuthError: error.message.includes('auth') || error.message.includes('authentication'),
        // Extract error code if available
        errorCode: (error as { code?: string }).code || 'unknown',
        errorDetails: (error as { details?: string }).details || 'none'
      });

      // Check for specific Firebase errors with detailed analysis
      if (error.message.includes('Missing or insufficient permissions')) {
        console.error('🔒 PERMISSION ERROR ANALYSIS:');
        console.error('- This suggests the data structure does not match security rules');
        console.error('- Current security rules are simplified for debugging');
        console.error('- Required fields: videoId, beatModel, chordModel, beats, chords, synchronizedChords, createdAt');
        console.error('- Field size limit: 50 fields');
        console.error('- Check if videoId matches 11-character YouTube format');
        console.error('- Check if all required fields are present and correct types');
      } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('🌐 NETWORK ERROR ANALYSIS:');
        console.warn('- Network/CORS error accessing Firestore');
        console.warn('- This might be a temporary connectivity issue');
        console.warn('- Disabling Firestore for this session');
        firestoreDisabled = true;
      } else if (error.message.includes('Invalid document')) {
        console.error('📄 DOCUMENT VALIDATION ERROR:');
        console.error('- The document structure is invalid');
        console.error('- Check for unsupported data types or circular references');
        console.error('- Firestore supports: string, number, boolean, null, array, map, timestamp, geopoint, reference');
      } else if (error.message.includes('quota')) {
        console.error('💰 QUOTA ERROR:');
        console.error('- Firestore quota exceeded');
        console.error('- This might be a temporary limit issue');
      } else if (error.message.includes('auth') || error.message.includes('authentication')) {
        console.error('🔐 AUTHENTICATION ERROR:');
        console.error('- User authentication issue');
        console.error('- Check if anonymous auth is properly configured');
      } else {
        console.error('❓ UNKNOWN ERROR TYPE:');
        console.error('- This is an unexpected error');
        console.error('- Full error object:', error);
      }
    } else {
      console.error('❓ NON-ERROR OBJECT THROWN:', {
        type: typeof error,
        value: error,
        stringified: String(error)
      });
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
    // console.log(`Getting all transcriptions for video: ${videoId}`);

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

    // console.log(`Found ${transcriptions.length} transcriptions for video ${videoId}`);
    return transcriptions;
  } catch (error) {
    console.error('Error getting video transcriptions from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      // Check for CORS or network errors and handle gracefully
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('Network/CORS error accessing Firestore - continuing without cache');
      }
    }
    return [];
  }
}
