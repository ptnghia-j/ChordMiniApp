import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db, TRANSLATIONS_COLLECTION } from '@/config/firebase';
import { collection, doc, getDoc, setDoc, Firestore } from 'firebase/firestore';
import crypto from 'crypto';

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Log API key status for debugging (without revealing the key)
console.log('Gemini API Key status:', apiKey ? 'Provided' : 'Missing');

// Initialize Gemini API with the API key
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Define the model name to use
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// Translation cache collection is imported from firebase.ts

interface TranslationRequest {
  lyrics: string;
  sourceLanguage?: string; // Optional source language
  targetLanguage?: string; // Target language (default is English)
  videoId?: string; // Optional video ID for better caching
  geminiApiKey?: string; // Optional user-provided Gemini API key (BYOK)
}

interface TranslationResponse {
  originalLyrics: string;
  translatedLyrics: string;
  sourceLanguage: string;
  targetLanguage: string;
  detectedLanguage?: string;
}

/**
 * Generates a cache key for storing translations
 */
function generateCacheKey(lyrics: string, sourceLanguage?: string, targetLanguage?: string, videoId?: string): string {
  // Create a deterministic key based on the content and optional parameters
  const baseKey = lyrics.substring(0, 100); // Use first 100 chars to avoid overly long keys
  const sourceLangKey = sourceLanguage ? `-${sourceLanguage}` : '';
  const targetLangKey = targetLanguage ? `-to-${targetLanguage}` : '-to-english'; // Default to English
  const vidKey = videoId ? `-${videoId}` : '';

  // Use a hash of the full lyrics to ensure uniqueness
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

    // Wrap Firestore operations in try-catch to handle CORS and other access issues
    try {
      const translationsRef = collection(db as Firestore, TRANSLATIONS_COLLECTION);
      const docRef = doc(translationsRef, cacheKey);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as TranslationResponse;
      }
    } catch (firestoreError) {
      console.warn('Firestore access error, proceeding without cache:', firestoreError);
      // Continue execution without using cache
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
      await setDoc(docRef, data);
      console.log('Successfully cached translation data');
    } catch (firestoreError) {
      console.warn('Firestore access error, unable to cache translation:', firestoreError);
      // Continue execution without caching
    }
  } catch (error) {
    console.error('Error caching translation:', error);
    // Non-critical error, continue execution
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

    // Create the prompt for language detection
    const prompt = `Detect the language of the following lyrics. Respond with only the language name in English:

    ${lyrics.substring(0, 500)}`;

    // Generate content using the Gemini model
    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
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
    // Special handling for Chinese to English translation
    let prompt = '';
    if (sourceLanguage === 'Chinese' && targetLanguage.toLowerCase() === 'english') {
      prompt = `Translate the following Chinese lyrics to English. Maintain the original line breaks and structure.
      Provide a natural, fluent translation that captures the meaning and emotion of the lyrics:

      ${lyrics}`;

      console.log('Using specialized Chinese to English translation prompt');
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

    // Generate content using the Gemini model
    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    const translatedText = response.text?.trim() || '';

    // Log a sample of the translation for debugging
    console.log('Translation sample (first 100 chars):', translatedText.substring(0, 100));

    return translatedText;
  } catch (error) {
    console.error('Error translating lyrics:', error);
    throw new Error('Failed to translate lyrics');
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('Translation API called');

    // Parse the request body
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
      console.warn('Empty lyrics provided to translation API');
      return NextResponse.json(
        { error: 'Lyrics are required' },
        { status: 400 }
      );
    }

    // Determine which API key to use (user-provided key takes precedence)
    const finalApiKey = geminiApiKey || apiKey;

    // Check if Gemini API key is available
    if (!finalApiKey) {
      console.error('Gemini API key is missing');
      return NextResponse.json(
        { error: 'Translation service is not configured properly. Please provide a Gemini API key.' },
        { status: 500 }
      );
    }

    // Create a Gemini AI instance with the appropriate API key
    const geminiAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : ai;

    // Generate a cache key for this translation request
    const cacheKey = generateCacheKey(lyrics, sourceLanguage, targetLanguage, videoId);
    console.log('Generated cache key for translation');

    // Check if we have a cached translation
    const cachedTranslation = await checkCache(cacheKey);
    if (cachedTranslation) {
      console.log('Found cached translation, returning it');
      return NextResponse.json(cachedTranslation);
    }
    console.log('No cached translation found, proceeding with translation');

    // Detect language if not provided
    let detectedLanguage: string | undefined;
    let finalSourceLanguage = sourceLanguage;

    if (!sourceLanguage) {
      console.log('Source language not provided, detecting language');
      detectedLanguage = await detectLanguage(lyrics, geminiAI);
      finalSourceLanguage = detectedLanguage;
      console.log(`Language detected as: ${detectedLanguage}`);
    }

    // Skip translation if the source language is the same as the target language
    if (finalSourceLanguage?.toLowerCase() === targetLanguage.toLowerCase()) {
      console.log('Source and target languages are the same, skipping translation');
      const response: TranslationResponse = {
        originalLyrics: lyrics,
        translatedLyrics: lyrics, // Same as original if languages match
        sourceLanguage: finalSourceLanguage,
        targetLanguage,
        detectedLanguage
      };

      // Cache the result
      await cacheTranslation(cacheKey, response);
      console.log('Cached the same-language response');

      return NextResponse.json(response);
    }

    // Translate the lyrics
    console.log(`Translating from ${finalSourceLanguage} to ${targetLanguage}`);
    const translatedLyrics = await translateLyrics(lyrics, finalSourceLanguage, targetLanguage, geminiAI);

    if (!translatedLyrics || translatedLyrics.trim() === '') {
      console.error('Translation returned empty result');
      return NextResponse.json(
        { error: 'Translation service returned an empty result' },
        { status: 500 }
      );
    }

    console.log('Translation successful');
    const response: TranslationResponse = {
      originalLyrics: lyrics,
      translatedLyrics,
      sourceLanguage: finalSourceLanguage || 'Unknown',
      targetLanguage,
      detectedLanguage
    };

    // Cache the result
    console.log('Caching translation result');
    await cacheTranslation(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in translation API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate lyrics' },
      { status: 500 }
    );
  }
}
