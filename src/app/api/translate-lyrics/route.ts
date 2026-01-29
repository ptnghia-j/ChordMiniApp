import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db, TRANSLATIONS_COLLECTION } from '@/config/firebase';
import { collection, doc, getDoc, setDoc, Firestore, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Log API key status for debugging (without revealing the key)
console.log('Gemini API Key status:', apiKey ? 'Provided' : 'Missing');

// Initialize Gemini API with the API key and timeout configuration
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    timeout: 120000 // 120 seconds timeout (maximum allowed)
  }
});

// Define the model name to use (using stable Gemini 2.0 Flash for reliability)
const MODEL_NAME = 'gemini-2.0-flash';

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
async function cacheTranslation(cacheKey: string, data: TranslationResponse, videoId?: string): Promise<void> {
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
        videoId: videoId || 'unknown', // Add videoId required by Firestore rules
        createdAt: serverTimestamp(), // Use Firestore serverTimestamp instead of Date.now()
      };
      await setDoc(docRef, dataWithTimestamp);
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
 * Cleans the translation response to ensure only translated content is returned
 */
function cleanTranslationResponse(translatedText: string, originalLyrics: string, targetLanguage: string): string {
  // Remove common prefixes that Gemini might add
  const prefixesToRemove = [
    `Here is the ${targetLanguage} translation:`,
    `Here's the ${targetLanguage} translation:`,
    `${targetLanguage} translation:`,
    'Translation:',
    'Here is the translation:',
    'Here\'s the translation:',
    'The translation is:',
    'Translated lyrics:',
    'English translation:',
    'English lyrics:',
  ];

  let cleaned = translatedText;

  // Remove prefixes (case insensitive)
  for (const prefix of prefixesToRemove) {
    const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
    cleaned = cleaned.replace(regex, '');
  }

  // UPDATED: More conservative line filtering to preserve vocal expressions and complete structure
  const originalLines = originalLyrics.split('\n').map(line => line.trim());
  const translatedLines = cleaned.split('\n');

  // Define patterns for vocal expressions that should be preserved even if they match original
  const vocalExpressions = /^(la\s*)+$|^(oh\s*)+$|^(ah\s*)+$|^(na\s*)+$|^(hey\s*)+$|^(yeah\s*)+$|^(wo\s*)+$|^(da\s*)+$|^(ba\s*)+$|^(mm\s*)+$|^(hm\s*)+$|^(uh\s*)+$/i;

  const filteredLines = translatedLines.filter(translatedLine => {
    const trimmedTranslated = translatedLine.trim();

    // Always keep empty lines and very short lines (formatting)
    if (trimmedTranslated.length <= 1) return true;

    // Always keep vocal expressions, even if they match original
    if (vocalExpressions.test(trimmedTranslated)) return true;

    // For longer lines, only filter if they're exact duplicates of original AND not vocal expressions
    if (trimmedTranslated.length > 10) {
      return !originalLines.some(originalLine => {
        // Only remove if it's an exact match and longer than 10 characters (likely actual duplication)
        return originalLine === trimmedTranslated && originalLine.length > 10 && !vocalExpressions.test(originalLine);
      });
    }

    // Keep all other lines (short phrases, partial matches, etc.)
    return true;
  });

  // Rejoin the filtered lines
  cleaned = filteredLines.join('\n');

  // Final cleanup - remove extra whitespace and empty lines at start/end
  cleaned = cleaned.trim();

  return cleaned;
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
    // Create comprehensive prompt to ensure complete line-by-line translation
    let prompt = '';
    if (sourceLanguage === 'Chinese' && targetLanguage.toLowerCase() === 'english') {
      prompt = `You are a professional translator. Translate the following Chinese lyrics to English.

CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:
1. COMPLETE TRANSLATION: Include ALL lines from the original lyrics in your response
2. LINE-BY-LINE MATCHING: Your output must have the EXACT same number of lines as the input
3. NON-TRANSLATABLE ELEMENTS: Keep vocal expressions like "la la la", "oh oh oh", "na na na", "ah ah ah", "hey hey hey", "yeah yeah yeah" EXACTLY as they are
4. EMPTY LINES: Preserve all empty lines and spacing exactly as in the original
5. STRUCTURE: Maintain identical line breaks, verse structure, and formatting
6. NO OMISSIONS: Do not skip any lines, even if they seem repetitive or non-meaningful
7. RESPONSE FORMAT: Return ONLY the translated lyrics, no explanations or additional text

Chinese lyrics to translate:
${lyrics}

Respond with the complete English translation (same line count as original):`;

      console.log('Using specialized Chinese to English translation prompt');
    }
    else if (sourceLanguage && sourceLanguage !== 'Unknown') {
      prompt = `You are a professional translator. Translate the following ${sourceLanguage} lyrics to ${targetLanguage}.

CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:
1. COMPLETE TRANSLATION: Include ALL lines from the original lyrics in your response
2. LINE-BY-LINE MATCHING: Your output must have the EXACT same number of lines as the input
3. NON-TRANSLATABLE ELEMENTS: Keep vocal expressions like "la la la", "oh oh oh", "na na na", "ah ah ah", "hey hey hey", "yeah yeah yeah" EXACTLY as they are
4. EMPTY LINES: Preserve all empty lines and spacing exactly as in the original
5. STRUCTURE: Maintain identical line breaks, verse structure, and formatting
6. NO OMISSIONS: Do not skip any lines, even if they seem repetitive or non-meaningful
7. RESPONSE FORMAT: Return ONLY the translated lyrics, no explanations or additional text

${sourceLanguage} lyrics to translate:
${lyrics}

Respond with the complete ${targetLanguage} translation (same line count as original):`;
    }
    else {
      prompt = `You are a professional translator. Translate the following lyrics to ${targetLanguage}.

CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:
1. COMPLETE TRANSLATION: Include ALL lines from the original lyrics in your response
2. LINE-BY-LINE MATCHING: Your output must have the EXACT same number of lines as the input
3. NON-TRANSLATABLE ELEMENTS: Keep vocal expressions like "la la la", "oh oh oh", "na na na", "ah ah ah", "hey hey hey", "yeah yeah yeah" EXACTLY as they are
4. EMPTY LINES: Preserve all empty lines and spacing exactly as in the original
5. STRUCTURE: Maintain identical line breaks, verse structure, and formatting
6. NO OMISSIONS: Do not skip any lines, even if they seem repetitive or non-meaningful
7. RESPONSE FORMAT: Return ONLY the translated lyrics, no explanations or additional text

Lyrics to translate:
${lyrics}

Respond with the complete ${targetLanguage} translation (same line count as original):`;
    }

    console.log(`Translating from ${sourceLanguage || 'unknown language'} to ${targetLanguage}`);

    // Generate content using the Gemini model
    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    let translatedText = response.text?.trim() || '';

    // Post-process the response to ensure we only have the translation
    translatedText = cleanTranslationResponse(translatedText, lyrics, targetLanguage);

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
      await cacheTranslation(cacheKey, response, videoId);
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

    // Cache the result in the background - don't let caching failures block the response
    console.log('Caching translation result');
    try {
      await cacheTranslation(cacheKey, response, videoId);
    } catch (cachingError) {
      console.warn('Failed to cache translation, but returning successful translation to user:', cachingError);
      // Continue execution - caching failure should not prevent successful translation from reaching user
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in translation API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate lyrics' },
      { status: 500 }
    );
  }
}
