import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { firestoreDb } from '@/services/firebaseService';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export const maxDuration = 120; // 2 minutes for key detection processing

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Initialize Gemini API with the API key and timeout configuration
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    timeout: 120000 // 120 seconds timeout (maximum allowed)
  }
});

// Define the model name to use
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// Define types for chord data
interface ChordData {
  chord: string;
  time?: number;
}

// Helper function to generate cache key for key detection
function generateKeyDetectionCacheKey(chords: ChordData[], includeEnharmonicCorrection: boolean = false): string {
  const chordString = chords
    .map(chord => `${chord.time?.toFixed(2) || 0}:${chord.chord || chord}`)
    .join('|');

  // Include enharmonic correction flag in the cache key
  const keyString = `${chordString}_enharmonic:${includeEnharmonicCorrection}`;
  return Buffer.from(keyString).toString('base64').substring(0, 50);
}

// Define types for key detection result
interface KeyDetectionResult {
  primaryKey: string;
  modulation?: string | null;
  originalChords?: string[];
  correctedChords?: string[];
  corrections?: Record<string, string>;
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
      }>;
    };
  } | null;
  rawResponse?: string;
  timestamp?: unknown;
  cacheKey?: string;
}

// Helper function to check cache for key detection
async function checkKeyDetectionCache(cacheKey: string): Promise<KeyDetectionResult | null> {
  try {
    const docRef = doc(firestoreDb, 'keyDetections', cacheKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as KeyDetectionResult;
      console.log('Found cached key detection');
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error checking key detection cache:', error);
    return null;
  }
}

// Helper function to save key detection to cache
async function saveKeyDetectionToCache(cacheKey: string, keyResult: KeyDetectionResult): Promise<void> {
  try {
    const docRef = doc(firestoreDb, 'keyDetections', cacheKey);

    // ENHANCED: Ensure sequence corrections are properly structured for caching
    const cacheData = {
      ...keyResult,
      timestamp: serverTimestamp(),
      cacheKey,
      // Ensure sequence corrections are properly stored
      sequenceCorrections: keyResult.sequenceCorrections ? {
        originalSequence: keyResult.sequenceCorrections.originalSequence || [],
        correctedSequence: keyResult.sequenceCorrections.correctedSequence || [],
        keyAnalysis: keyResult.sequenceCorrections.keyAnalysis || null
      } : null
    };

    // Debug: Log the exact data structure being saved
    // console.log('🔍 KEY DETECTION CACHE DATA:', {
    //   keys: Object.keys(cacheData),
    //   primaryKey: cacheData.primaryKey,
    //   modulation: cacheData.modulation,
    //   hasOriginalChords: !!cacheData.originalChords,
    //   hasCorrectedChords: !!cacheData.correctedChords,
    //   hasCorrections: !!cacheData.corrections,
    //   hasSequenceCorrections: !!cacheData.sequenceCorrections,
    //   hasRawResponse: !!cacheData.rawResponse,
    //   hasCacheKey: !!cacheData.cacheKey,
    //   hasTimestamp: !!cacheData.timestamp,
    //   dataSize: Object.keys(cacheData).length,
    //   primaryKeyType: typeof cacheData.primaryKey,
    //   primaryKeyLength: cacheData.primaryKey?.length || 0,
    //   // Deep inspection of sequenceCorrections
    //   sequenceCorrectionsStructure: cacheData.sequenceCorrections ? {
    //     hasOriginalSequence: !!cacheData.sequenceCorrections.originalSequence,
    //     hasCorrectSequence: !!cacheData.sequenceCorrections.correctedSequence,
    //     hasKeyAnalysis: !!cacheData.sequenceCorrections.keyAnalysis,
    //     originalSequenceLength: cacheData.sequenceCorrections.originalSequence?.length || 0,
    //     correctedSequenceLength: cacheData.sequenceCorrections.correctedSequence?.length || 0,
    //     keyAnalysisStructure: cacheData.sequenceCorrections.keyAnalysis ? {
    //       hasSections: !!cacheData.sequenceCorrections.keyAnalysis.sections,
    //       hasModulations: !!cacheData.sequenceCorrections.keyAnalysis.modulations,
    //       sectionsLength: cacheData.sequenceCorrections.keyAnalysis.sections?.length || 0,
    //       modulationsLength: cacheData.sequenceCorrections.keyAnalysis.modulations?.length || 0
    //     } : null
    //   } : null
    // });

    // Also log the full data structure for debugging
    // console.log('🔍 FULL CACHE DATA STRUCTURE:', JSON.stringify(cacheData, null, 2));

    await setDoc(docRef, cacheData);
    console.log('✅ Key detection saved to cache successfully');
  } catch (error) {
    console.error('❌ Error saving key detection to cache:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500)
      });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { chords, includeEnharmonicCorrection = false, bypassCache = false, geminiApiKey } = await request.json();

    if (!chords || !Array.isArray(chords) || chords.length === 0) {
      return NextResponse.json(
        { error: 'Invalid chord progression data' },
        { status: 400 }
      );
    }

    // Determine which API key to use (user-provided key takes precedence)
    const finalApiKey = geminiApiKey || apiKey;

    // Check if Gemini API key is available
    if (!finalApiKey) {
      console.error('Gemini API key is missing');
      return NextResponse.json(
        { error: 'Key detection service is not configured properly. Please provide a Gemini API key.' },
        { status: 500 }
      );
    }

    // Create a Gemini AI instance with the appropriate API key and timeout configuration
    const geminiAI = geminiApiKey ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        timeout: 120000 // 120 seconds timeout (maximum allowed)
      }
    }) : ai;

    // Generate cache key (include enharmonic flag in cache key)
    const cacheKey = generateKeyDetectionCacheKey(chords, includeEnharmonicCorrection);

    // Check cache first (unless bypassed for testing)
    const cachedResult = bypassCache ? null : await checkKeyDetectionCache(cacheKey);
    if (cachedResult && !bypassCache) {
      // Extract chord names for fallback if enharmonic correction data is missing
      const chordNames = chords.map((chord: ChordData) => {
        if (typeof chord === 'string') {
          return chord;
        }
        return chord.chord || String(chord);
      });



      return NextResponse.json({
        primaryKey: cachedResult.primaryKey,
        modulation: cachedResult.modulation,
        rawResponse: cachedResult.rawResponse,
        // Ensure we always return these fields, even if they're missing from old cache
        originalChords: cachedResult.originalChords || (includeEnharmonicCorrection ? chordNames : undefined),
        correctedChords: cachedResult.correctedChords || (includeEnharmonicCorrection ? chordNames : undefined),
        corrections: cachedResult.corrections || {},
        // ENHANCED: Include sequence corrections from cache with proper structure
        sequenceCorrections: cachedResult.sequenceCorrections || null,
        fromCache: true
      });
    }

    // Format chord progression for AI analysis
    const chordProgression = chords
      .map((chord: ChordData, index: number) => {
        const timestamp = chord.time ? `${chord.time.toFixed(2)}s` : `${index}`;
        return `${timestamp}: ${chord.chord || chord}`;
      })
      .join(', ');

    // Extract just the chord names for enharmonic correction
    const chordNames = chords.map((chord: ChordData) => {
      if (typeof chord === 'string') {
        return chord;
      }
      return chord.chord || String(chord);
    });

    let prompt: string;

    if (includeEnharmonicCorrection) {
      // Enhanced prompt for context-aware sequence-based enharmonic correction
      const chordSequence = chordNames.filter(chord => chord && chord !== 'N.C.' && chord !== 'N/C');

      prompt = `Analyze this chord progression sequence and provide ONLY enharmonic spelling corrections (like C# ↔ Db, F# ↔ Gb) based on key context. DO NOT change chord qualities or functions.

CHORD SEQUENCE (in order): [${chordSequence.join(', ')}]

TIMING INFORMATION: ${chordProgression}

Please respond with ONLY a JSON object in this exact format:
{
  "primaryKey": "[Key Name]",
  "modulation": "[Key Name]" or null,
  "sequenceCorrections": {
    "originalSequence": [${chordSequence.map(c => `"${c}"`).join(', ')}],
    "correctedSequence": ["corrected1", "corrected2", ...],
    "keyAnalysis": {
      "sections": [
        {
          "startIndex": 0,
          "endIndex": 10,
          "key": "E major",
          "chords": ["chord1", "chord2", ...]
        }
      ],
      "modulations": [
        {
          "fromKey": "E major",
          "toKey": "Ab major",
          "atIndex": 15
        }
      ]
    }
  },
  "corrections": {
    "originalChord1": "correctedChord1"
  }
}

CRITICAL INSTRUCTIONS - ENHARMONIC CORRECTIONS ONLY:
1. **SAME PITCH REQUIREMENT**: Only change note spelling, never the actual pitch
   - ENHARMONIC EQUIVALENTS (same pitch): C#↔Db, D#↔Eb, F#↔Gb, G#↔Ab, A#↔Bb
   - DIFFERENT PITCHES (never change): C≠C#, D≠D#, E≠F, F≠F#, G≠G#, A≠A#, B≠C
   - Example: Gdim can become F#dim (G# and Ab are same pitch) but NEVER A#dim (G and A# are different pitches!)

2. **HARMONIC FUNCTION PRESERVATION**: The bass line progression must remain identical
   - Original progression: E→F#→Gdim→G#m
   - Valid correction: E→F#→F##dim→G#m (G# and Ab are same pitch)
   - INVALID correction: E→F#→A#dim→G#m (G and A# are different pitches - changes harmonic function!)
   - Please aware of walking bass line (E→F#→F##→G# in the context of the key and in the direction of the bass line and hence F## fits in) and notice the double accidentals, double sharps (F##) used in the example above.

3. **CHORD QUALITY PRESERVATION**: Keep ALL chord qualities exactly unchanged
   - "Gdim" stays "dim" quality, can become "F#dim" but never "A#dim" or "Gmaj"
   - "F#7" stays "7" quality, can become "Gb7" but never "F7" or "F#maj7"
   - "C#m" stays "m" quality, can become "Dbm" but never "C#" or "Dm"

4. **KEY SIGNATURE OPTIMIZATION**: Choose spellings with less accidentals
   - Prefer Db major (5 flats) over C# major (7 sharps)
   - Prefer B major (5 sharps) over Cb major (7 flats)

5. **CONSERVATIVE APPROACH**: When uncertain, preserve original spelling

VALID CORRECTION EXAMPLES (same pitch, different spelling):
- "C#m" → "Dbm" (C# and Db are the same pitch)
- "F#7" → "Gb7" (F# and Gb are the same pitch)
- "G#dim" → "Abdim" (G# and Ab are the same pitch)
- "A#" → "Bb" (A# and Bb are the same pitch)

INVALID CORRECTION EXAMPLES (NEVER DO - different pitches or qualities):
- "Gdim" → "A#dim" (G and A# are DIFFERENT PITCHES!)
- "F" → "F#" (F and F# are DIFFERENT PITCHES!)
- "C" → "Cm" (changes chord quality)
- "F#7" → "F7" (F# and F are DIFFERENT PITCHES!)
- "Am" → "A" (removes chord quality)

Respond with ONLY the JSON object, no explanations.`;
    } else {
      // Original prompt for key detection only
      prompt = `Analyze the following chord progression and determine the musical key and any modulations.

Chord progression: ${chordProgression}

Please provide ONLY the key and modulation information in this exact format:
Primary Key: **[Key Name]**
Possible Tonal Modulation: **[Key Name]** (around [timestamp]) OR **None**

Do not include any explanations, analysis, or additional text. Just give me the key and possible tonal modulation information in the specified format.`;
    }

    console.log('Sending key detection request to Gemini API');

    // Generate content using the Gemini model
    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    const text = response.text?.trim() || '';

    let result: KeyDetectionResult;

    if (includeEnharmonicCorrection) {
      // Parse JSON response for enhanced mode
      try {
        // Clean the response text to remove markdown code blocks if present
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const jsonResponse = JSON.parse(cleanedText);
        // console.log('🔍 PARSED JSON RESPONSE:', {
        //   hasSequenceCorrections: !!jsonResponse.sequenceCorrections,
        //   hasCorrections: !!jsonResponse.corrections,
        //   primaryKey: jsonResponse.primaryKey,
        //   sequenceCorrectionsLength: jsonResponse.sequenceCorrections?.correctedSequence?.length || 0
        // });

        // Handle both new sequence-based format and legacy format
        if (jsonResponse.sequenceCorrections) {
          // NEW: Enhanced sequence-based corrections
          const sequenceCorrections = jsonResponse.sequenceCorrections;
          const correctedSequence = sequenceCorrections.correctedSequence || chordNames;

          // Create legacy corrections mapping for backward compatibility
          const legacyCorrections: Record<string, string> = {};
          if (sequenceCorrections.originalSequence && sequenceCorrections.correctedSequence) {
            sequenceCorrections.originalSequence.forEach((original: string, index: number) => {
              const corrected = sequenceCorrections.correctedSequence[index];
              if (original !== corrected) {
                legacyCorrections[original] = corrected;
              }
            });
          }

          result = {
            primaryKey: jsonResponse.primaryKey || 'Unknown',
            modulation: jsonResponse.modulation || null,
            originalChords: chordNames,
            correctedChords: correctedSequence,
            corrections: legacyCorrections,
            sequenceCorrections: sequenceCorrections,
            rawResponse: text
          };
        } else {
          // LEGACY: Individual chord corrections (fallback)
          const corrections = jsonResponse.corrections || {};

          // Apply corrections to create corrected chord array
          const correctedChords = chordNames.map(chord => {
            // Apply correction if available, otherwise keep original
            return corrections[chord] || chord;
          });

          result = {
            primaryKey: jsonResponse.primaryKey || 'Unknown',
            modulation: jsonResponse.modulation || null,
            originalChords: chordNames,
            correctedChords: correctedChords,
            corrections: corrections,
            rawResponse: text
          };
        }
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        // Fallback to original format
        const primaryKeyMatch = text.match(/Primary Key:\s*\*\*([^*]+)\*\*/);
        const modulationMatch = text.match(/Possible Tonal Modulation:\s*\*\*([^*]+)\*\*/);

        result = {
          primaryKey: primaryKeyMatch ? primaryKeyMatch[1].trim() : 'Unknown',
          modulation: modulationMatch ? modulationMatch[1].trim() === 'None' ? null : modulationMatch[1].trim() : null,
          originalChords: chordNames,
          correctedChords: chordNames, // No correction if parsing failed
          corrections: {},
          rawResponse: text
        };
      }
    } else {
      // Parse original format response
      const primaryKeyMatch = text.match(/Primary Key:\s*\*\*([^*]+)\*\*/);
      const modulationMatch = text.match(/Possible Tonal Modulation:\s*\*\*([^*]+)\*\*/);

      result = {
        primaryKey: primaryKeyMatch ? primaryKeyMatch[1].trim() : 'Unknown',
        modulation: modulationMatch ? modulationMatch[1].trim() === 'None' ? null : modulationMatch[1].trim() : null,
        rawResponse: text
      };
    }

    // Save to cache
    await saveKeyDetectionToCache(cacheKey, result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error detecting key:', error);
    return NextResponse.json(
      { error: 'Failed to detect musical key' },
      { status: 500 }
    );
  }
}
