import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db, TRANSLATIONS_COLLECTION } from '@/config/firebase';
import { collection, doc, getDoc, setDoc, Firestore, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

// Define the model name to use (using stable Gemini 2.0 Flash for reliability)
const MODEL_NAME = 'gemini-2.0-flash';

// Lazy initialization of Gemini API client to avoid build-time errors
let _ai: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (_ai) return _ai;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Gemini API Key not configured');
    return null;
  }

  _ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 120000 // 120 seconds timeout (maximum allowed)
    }
  });

  return _ai;
}

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
async function detectLanguage(lyrics: string, geminiAI: GoogleGenAI): Promise<string> {
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
async function translateLyrics(lyrics: string, sourceLanguage?: string, targetLanguage: string = 'English', geminiAI: GoogleGenAI): Promise<string> {
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

    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    // Extract and clean the response text
    let translatedText = response.text?.trim() || '';

    // Post-process the response to ensure we only have the translation
    translatedText = cleanTranslationResponse(translatedText, lyrics, targetLanguage);

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
  geminiAI: GoogleGenAI,
  videoId?: string
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

      await cacheTranslation(cacheKey, response, videoId);
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

    // Create a Gemini AI instance with the appropriate API key
    // User-provided key takes precedence over environment variable
    let geminiAI: GoogleGenAI;

    if (geminiApiKey) {
      // Use user-provided API key (BYOK)
      geminiAI = new GoogleGenAI({ apiKey: geminiApiKey });
    } else {
      // Use server-configured API key
      const serverClient = getGeminiClient();
      if (!serverClient) {
        return NextResponse.json(
          { error: 'Translation service is not configured properly. Please provide a Gemini API key.' },
          { status: 500 }
        );
      }
      geminiAI = serverClient;
    }

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
          performBackgroundTranslation(cacheKey, lyrics, sourceLanguage, targetLanguage, geminiAI, videoId)
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

      // Cache the translation in the background - don't let caching failures block the response
      try {
        await cacheTranslation(cacheKey, response, videoId);
      } catch (cachingError) {
        console.warn('Failed to cache same-language translation, but returning successful result to user:', cachingError);
        // Continue execution - caching failure should not prevent successful response from reaching user
      }

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

    // Cache the translation in the background - don't let caching failures block the response
    try {
      await cacheTranslation(cacheKey, response, videoId);
    } catch (cachingError) {
      console.warn('Failed to cache translation, but returning successful translation to user:', cachingError);
      // Continue execution - caching failure should not prevent successful translation from reaching user
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in cache-first translation API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate lyrics' },
      { status: 500 }
    );
  }
}
