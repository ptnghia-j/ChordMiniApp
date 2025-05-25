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
function generateKeyDetectionCacheKey(chords: any[]): string {
  const chordString = chords
    .map(chord => `${chord.time?.toFixed(2) || 0}:${chord.chord || chord}`)
    .join('|');
  return Buffer.from(chordString).toString('base64').substring(0, 50);
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
    const { chords, videoId } = await request.json();

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

    // Generate cache key
    const cacheKey = generateKeyDetectionCacheKey(chords);

    // Check cache first
    const cachedResult = await checkKeyDetectionCache(cacheKey);
    if (cachedResult) {
      return NextResponse.json({
        primaryKey: cachedResult.primaryKey,
        modulation: cachedResult.modulation,
        rawResponse: cachedResult.rawResponse,
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

    // Create prompt for key detection
    const prompt = `Analyze the following chord progression and determine the musical key and any modulations.

Chord progression: ${chordProgression}

Please provide ONLY the key and modulation information in this exact format:
Primary Key: **[Key Name]**
Possible Tonal Modulation: **[Key Name]** (around [timestamp]) OR **None**

Do not include any explanations, analysis, or additional text. Just give me the key and possible tonal modulation information in the specified format.`;

    console.log('Sending key detection request to Gemini API');

    // Generate content using the Gemini model
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    const text = response.text?.trim() || '';
    console.log('Key detection response:', text);

    // Parse the response to extract key information
    const primaryKeyMatch = text.match(/Primary Key:\s*\*\*([^*]+)\*\*/);
    const modulationMatch = text.match(/Possible Tonal Modulation:\s*\*\*([^*]+)\*\*/);

    const primaryKey = primaryKeyMatch ? primaryKeyMatch[1].trim() : 'Unknown';
    const modulation = modulationMatch ? modulationMatch[1].trim() : 'None';

    const result = {
      primaryKey,
      modulation: modulation === 'None' ? null : modulation,
      rawResponse: text
    };

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
