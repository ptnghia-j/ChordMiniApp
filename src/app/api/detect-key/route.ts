import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db, TRANSCRIPTIONS_COLLECTION } from '@/config/firebase';
import { collection, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Initialize Gemini API with the API key
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Define the model name to use
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// Helper function to generate cache key for key detection
function generateKeyDetectionCacheKey(chords: any[], includeEnharmonicCorrection: boolean = false): string {
  const chordString = chords
    .map(chord => `${chord.time?.toFixed(2) || 0}:${chord.chord || chord}`)
    .join('|');

  // Include enharmonic correction flag in the cache key
  const keyString = `${chordString}_enharmonic:${includeEnharmonicCorrection}`;
  return Buffer.from(keyString).toString('base64').substring(0, 50);
}

// Helper function to check cache for key detection
async function checkKeyDetectionCache(cacheKey: string): Promise<any | null> {
  try {
    const docRef = doc(db, 'keyDetections', cacheKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
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
async function saveKeyDetectionToCache(cacheKey: string, keyResult: any): Promise<void> {
  try {
    const docRef = doc(db, 'keyDetections', cacheKey);
    await setDoc(docRef, {
      ...keyResult,
      timestamp: serverTimestamp(),
      cacheKey
    });
    console.log('Saved key detection to cache');
  } catch (error) {
    console.error('Error saving key detection to cache:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { chords, videoId, includeEnharmonicCorrection = false } = await request.json();

    if (!chords || !Array.isArray(chords) || chords.length === 0) {
      return NextResponse.json(
        { error: 'Invalid chord progression data' },
        { status: 400 }
      );
    }

    // Check if Gemini API key is available
    if (!apiKey) {
      console.error('Gemini API key is missing');
      return NextResponse.json(
        { error: 'Key detection service is not configured properly' },
        { status: 500 }
      );
    }

    // Generate cache key (include enharmonic flag in cache key)
    const cacheKey = generateKeyDetectionCacheKey(chords, includeEnharmonicCorrection);

    // Check cache first
    const cachedResult = await checkKeyDetectionCache(cacheKey);
    if (cachedResult) {
      // Extract chord names for fallback if enharmonic correction data is missing
      const chordNames = chords.map((chord: any) => chord.chord || chord);

      return NextResponse.json({
        primaryKey: cachedResult.primaryKey,
        modulation: cachedResult.modulation,
        rawResponse: cachedResult.rawResponse,
        // Ensure we always return these fields, even if they're missing from old cache
        originalChords: cachedResult.originalChords || (includeEnharmonicCorrection ? chordNames : undefined),
        correctedChords: cachedResult.correctedChords || (includeEnharmonicCorrection ? chordNames : undefined),
        fromCache: true
      });
    }

    // Format chord progression for AI analysis
    const chordProgression = chords
      .map((chord: any, index: number) => {
        const timestamp = chord.time ? `${chord.time.toFixed(2)}s` : `${index}`;
        return `${timestamp}: ${chord.chord || chord}`;
      })
      .join(', ');

    // Extract just the chord names for enharmonic correction
    const chordNames = chords.map((chord: any) => chord.chord || chord);

    let prompt: string;

    if (includeEnharmonicCorrection) {
      // Enhanced prompt for both key detection and enharmonic correction
      const uniqueChords = [...new Set(chordNames.filter(chord => chord && chord !== 'N.C.' && chord !== 'N/C'))];

      prompt = `Analyze the following chord progression and provide both key detection and enharmonic corrections.

Chord progression: ${chordProgression}

Unique chords found: ${uniqueChords.join(', ')}

Please respond with ONLY a JSON object in this exact format:
{
  "primaryKey": "[Key Name]",
  "modulation": "[Key Name]" or null,
  "corrections": {
    "originalChord1": "correctedChord1",
    "originalChord2": "correctedChord2"
  }
}

Instructions:
1. Determine the primary key and any modulations
2. In the "corrections" object, ONLY include chords that need enharmonic correction:
   - In flat keys (F, Bb, Eb, Ab, Db, Gb): prefer flat spellings (Db over C#, Eb over D#)
   - In sharp keys (G, D, A, E, B, F#): prefer sharp spellings (C# over Db, F# over Gb)
   - In C major/A minor: use the most common spelling
3. Keep chord quality and extensions unchanged, only fix enharmonic spelling
4. Do NOT include chords that are already correctly spelled
5. Examples: {"C#": "Db", "C#maj7": "Dbmaj7"} in Ab major context
6. If no corrections are needed, use empty object: "corrections": {}

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
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    const text = response.text?.trim() || '';
    console.log('Key detection response:', text);

    let result: any;

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
