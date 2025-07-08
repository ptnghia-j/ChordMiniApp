import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db, TRANSLATIONS_COLLECTION } from '@/config/firebase';
import { collection, doc, getDoc, setDoc, Firestore } from 'firebase/firestore';
import crypto from 'crypto';

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Initialize Gemini API with the API key
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Define the model name to use
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// Track background updates in progress
const backgroundUpdatesInProgress = new Set<string>();

interface TranslationRequest {
  lyrics: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  videoId?: string;
  geminiApiKey?: string; // Optional user-provided Gemini API key (BYOK)
}

interface TranslationResponse {
  originalLyrics: string;
  translatedLyrics: string;
  sourceLanguage: string;
  targetLanguage: string;
  detectedLanguage?: string;
  fromCache?: boolean;
  backgroundUpdateInProgress?: boolean;
  timestamp?: number;
}

/**
 * Generates a cache key for storing translations
 */
function generateCacheKey(lyrics: string, sourceLanguage?: string, targetLanguage?: string, videoId?: string): string {
  const baseKey = lyrics.substring(0, 100);
  const sourceLangKey = sourceLanguage ? `-${sourceLanguage}` : '';
  const targetLangKey = targetLanguage ? `-to-${targetLanguage}` : '-to-english';
  const vidKey = videoId ? `-${videoId}` : '';

  const hash = crypto
    .createHash('md5')
    .update(lyrics)
    .digest('hex')
    .substring(0, 8);

  return `${baseKey}${sourceLangKey}${targetLangKey}${vidKey}-${hash}`;
}

/**
 * Checks the cache for an existing translation
 */
async function checkCache(cacheKey: string): Promise<TranslationResponse | null> {
  try {
    if (!db) {
      console.warn('Firebase not initialized, skipping cache check');
      return null;
    }

    try {
      const translationsRef = collection(db as Firestore, TRANSLATIONS_COLLECTION);
      const docRef = doc(translationsRef, cacheKey);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as TranslationResponse;
        return {
          ...data,
          fromCache: true,
          timestamp: data.timestamp || Date.now()
        };
      }
    } catch (firestoreError) {
      console.warn('Firestore access error, proceeding without cache:', firestoreError);
    }

    return null;
  } catch (error) {
    console.error('Error checking translation cache:', error);
    return null;
  }
}

/**
 * Stores a translation in the cache
 */
async function cacheTranslation(cacheKey: string, data: TranslationResponse): Promise<void> {
  try {
    if (!db) {
      console.warn('Firebase not initialized, skipping cache storage');
      return;
    }

    try {
      const translationsRef = collection(db as Firestore, TRANSLATIONS_COLLECTION);
      const docRef = doc(translationsRef, cacheKey);
      const dataWithTimestamp = {
        ...data,
        timestamp: Date.now(),
        fromCache: false
      };
      await setDoc(docRef, dataWithTimestamp);
      console.log('Successfully cached translation data');
    } catch (firestoreError) {
      console.warn('Firestore access error, unable to cache translation:', firestoreError);
    }
  } catch (error) {
    console.error('Error caching translation:', error);
  }
}

/**
 * Detects the language of the lyrics using Gemini API
 */
async function detectLanguage(lyrics: string, geminiAI: GoogleGenAI = ai): Promise<string> {
  try {
    // Check for Chinese characters using regex
    const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]/;
    if (chineseRegex.test(lyrics)) {
      console.log('Chinese characters detected in lyrics');
      return 'Chinese';
    }

    const prompt = `Detect the language of the following lyrics. Respond with only the language name in English:

    ${lyrics.substring(0, 500)}`;

    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    const text = response.text?.trim() || '';
    console.log('Detected language:', text);
    return text;
  } catch (error) {
    console.error('Error detecting language:', error);
    return 'Unknown';
  }
}

/**
 * Translates lyrics using Gemini API
 */
async function translateLyrics(lyrics: string, sourceLanguage?: string, targetLanguage: string = 'English', geminiAI: GoogleGenAI = ai): Promise<string> {
  try {
    let prompt = '';
    if (sourceLanguage === 'Chinese' && targetLanguage.toLowerCase() === 'english') {
      prompt = `Translate the following Chinese lyrics to English. Maintain the original line breaks and structure.
      Provide a natural, fluent translation that captures the meaning and emotion of the lyrics:

      ${lyrics}`;
    }
    else if (sourceLanguage && sourceLanguage !== 'Unknown') {
      prompt = `Translate the following ${sourceLanguage} lyrics to ${targetLanguage}. Maintain the original line breaks and structure:

      ${lyrics}`;
    }
    else {
      prompt = `Translate the following lyrics to ${targetLanguage}. Maintain the original line breaks and structure:

      ${lyrics}`;
    }

    console.log(`Translating from ${sourceLanguage || 'unknown language'} to ${targetLanguage}`);

    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    const translatedText = response.text?.trim() || '';
    console.log('Translation sample (first 100 chars):', translatedText.substring(0, 100));

    return translatedText;
  } catch (error) {
    console.error('Error translating lyrics:', error);
    throw new Error('Failed to translate lyrics');
  }
}

/**
 * Performs background translation and cache update
 */
async function performBackgroundTranslation(
  cacheKey: string,
  lyrics: string,
  sourceLanguage?: string,
  targetLanguage: string = 'English',
  geminiAI: GoogleGenAI = ai
): Promise<void> {
  try {
    console.log('Starting background translation update');

    // Mark this translation as in progress
    backgroundUpdatesInProgress.add(cacheKey);

    // Detect language if not provided
    let detectedLanguage: string | undefined;
    let finalSourceLanguage = sourceLanguage;

    if (!sourceLanguage) {
      detectedLanguage = await detectLanguage(lyrics, geminiAI);
      finalSourceLanguage = detectedLanguage;
    }

    // Skip translation if languages are the same
    if (finalSourceLanguage?.toLowerCase() === targetLanguage.toLowerCase()) {
      const response: TranslationResponse = {
        originalLyrics: lyrics,
        translatedLyrics: lyrics,
        sourceLanguage: finalSourceLanguage,
        targetLanguage,
        detectedLanguage
      };
      await cacheTranslation(cacheKey, response);
      // Mark as completed
      backgroundUpdatesInProgress.delete(cacheKey);
      console.log('Background translation completed (same language) and cached');
      return;
    }

    // Perform the translation
    const translatedLyrics = await translateLyrics(lyrics, finalSourceLanguage, targetLanguage, geminiAI);

    if (translatedLyrics && translatedLyrics.trim() !== '') {
      const response: TranslationResponse = {
        originalLyrics: lyrics,
        translatedLyrics,
        sourceLanguage: finalSourceLanguage || 'Unknown',
        targetLanguage,
        detectedLanguage
      };

      await cacheTranslation(cacheKey, response);
      console.log('Background translation completed and cached');
    }

    // Mark as completed
    backgroundUpdatesInProgress.delete(cacheKey);
  } catch (error) {
    console.error('Error in background translation:', error);
    // Mark as completed even on error
    backgroundUpdatesInProgress.delete(cacheKey);
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('Cache-first translation API called');

    const body: TranslationRequest = await request.json();
    const { lyrics, sourceLanguage, targetLanguage = 'English', videoId, geminiApiKey } = body;

    console.log('Translation request details:', {
      lyricsLength: lyrics?.length || 0,
      sourceLanguage,
      targetLanguage,
      videoIdProvided: !!videoId,
      userApiKeyProvided: !!geminiApiKey
    });

    if (!lyrics || lyrics.trim() === '') {
      return NextResponse.json(
        { error: 'Lyrics are required' },
        { status: 400 }
      );
    }

    // Determine which API key to use (user-provided key takes precedence)
    const finalApiKey = geminiApiKey || apiKey;

    if (!finalApiKey) {
      return NextResponse.json(
        { error: 'Translation service is not configured properly. Please provide a Gemini API key.' },
        { status: 500 }
      );
    }

    // Create a Gemini AI instance with the appropriate API key
    const geminiAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : ai;

    const cacheKey = generateCacheKey(lyrics, sourceLanguage, targetLanguage, videoId);

    // STEP 1: Check cache and return immediately if found
    const cachedTranslation = await checkCache(cacheKey);

    if (cachedTranslation) {
      console.log('Found cached translation, returning immediately');

      // Check if background update is actually in progress
      const isBackgroundUpdateInProgress = backgroundUpdatesInProgress.has(cacheKey);

      // STEP 2: Start background update only if not already in progress
      if (!isBackgroundUpdateInProgress) {
        console.log('Starting new background update');
        setImmediate(() => {
          performBackgroundTranslation(cacheKey, lyrics, sourceLanguage, targetLanguage, geminiAI)
            .catch(error => {
              console.error('Background translation failed:', error);
              // Background failures are non-critical since we already returned cached data
            });
        });
      } else {
        console.log('Background update already in progress, skipping new update');
      }

      // Return cached data with accurate background update status
      return NextResponse.json({
        ...cachedTranslation,
        backgroundUpdateInProgress: isBackgroundUpdateInProgress
      });
    }

    // STEP 3: No cache found, perform fresh translation
    console.log('No cached translation found, performing fresh translation');

    // Detect language if not provided
    let detectedLanguage: string | undefined;
    let finalSourceLanguage = sourceLanguage;

    if (!sourceLanguage) {
      detectedLanguage = await detectLanguage(lyrics, geminiAI);
      finalSourceLanguage = detectedLanguage;
    }

    // Skip translation if languages are the same
    if (finalSourceLanguage?.toLowerCase() === targetLanguage.toLowerCase()) {
      const response: TranslationResponse = {
        originalLyrics: lyrics,
        translatedLyrics: lyrics,
        sourceLanguage: finalSourceLanguage,
        targetLanguage,
        detectedLanguage,
        fromCache: false
      };

      await cacheTranslation(cacheKey, response);
      return NextResponse.json(response);
    }

    // Perform fresh translation
    const translatedLyrics = await translateLyrics(lyrics, finalSourceLanguage, targetLanguage, geminiAI);

    if (!translatedLyrics || translatedLyrics.trim() === '') {
      return NextResponse.json(
        { error: 'Translation service returned an empty result' },
        { status: 500 }
      );
    }

    const response: TranslationResponse = {
      originalLyrics: lyrics,
      translatedLyrics,
      sourceLanguage: finalSourceLanguage || 'Unknown',
      targetLanguage,
      detectedLanguage,
      fromCache: false
    };

    await cacheTranslation(cacheKey, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in cache-first translation API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate lyrics' },
      { status: 500 }
    );
  }
}
