import { NextRequest, NextResponse } from 'next/server';
import { ThinkingLevel } from '@google/genai';
import { firestoreDb } from '@/services/firebase/firebaseService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';
import { createGeminiClient, GEMINI_MODEL_NAME } from '@/config/gemini';
import { sanitizeLegacyCorrections, sanitizeSequenceCorrections } from '@/utils/keyDetectionCorrections';
import { estimateKeySignatureFromChords } from '@/utils/chordUtils';

export const maxDuration = 240; // 4 minutes for key detection processing

// Define the model name to use
const MODEL_NAME = GEMINI_MODEL_NAME;
const KEY_DETECTION_PROMPT_VERSION = 'v4-modulation-markers';

// Define types for chord data
interface ChordData {
  chord: string;
  time?: number;
}

// Helper function to generate cache key for key detection
function generateKeyDetectionCacheKey(chords: ChordData[], includeEnharmonicCorrection: boolean = false, includeRomanNumerals: boolean = false): string {
  // Create a more precise and unique representation
  const chordString = chords
    .map(chord => `${chord.time?.toFixed(3) || 0}:${chord.chord || chord}`)
    .join('|');

  // Put flags at the beginning to ensure they're not truncated
  const keyString = `prompt:${KEY_DETECTION_PROMPT_VERSION}_enharmonic:${includeEnharmonicCorrection}_roman:${includeRomanNumerals}_${chordString}`;

  // Use SHA-256 hash for better uniqueness and consistent length
  const hash = crypto.createHash('sha256').update(keyString).digest('hex');

  // Return first 32 characters of hash for reasonable cache key length
  return hash.substring(0, 32);
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
  romanNumerals?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  rawResponse?: string;
  fromCache?: boolean;
  fromHeuristicFallback?: boolean;
}

interface KeyDetectionCacheEntry {
  primaryKey: string;
  modulation?: string | null;
  corrections?: Record<string, string>;
  sequenceCorrections?: KeyDetectionResult['sequenceCorrections'];
  romanNumerals?: KeyDetectionResult['romanNumerals'];
}

function buildLegacyCorrections(
  sequenceCorrections: KeyDetectionResult['sequenceCorrections']
): Record<string, string> {
  const legacyCorrections: Record<string, string> = {};

  if (!sequenceCorrections?.originalSequence || !sequenceCorrections.correctedSequence) {
    return legacyCorrections;
  }

  sequenceCorrections.originalSequence.forEach((original: string, index: number) => {
    const corrected = sequenceCorrections.correctedSequence[index];
    if (original !== corrected) {
      legacyCorrections[original] = corrected;
    }
  });

  return legacyCorrections;
}

function buildCorrectedChordSequence(
  chordNames: string[],
  corrections: Record<string, string>,
  sequenceCorrections: KeyDetectionResult['sequenceCorrections']
): string[] {
  if (sequenceCorrections?.correctedSequence?.length) {
    return sequenceCorrections.correctedSequence;
  }

  return chordNames.map((chord) => corrections[chord] || chord);
}

function buildHeuristicKeyDetectionResult(params: {
  chordNames: string[];
  includeEnharmonicCorrection: boolean;
  rawResponse?: string;
}): KeyDetectionResult {
  const { chordNames, includeEnharmonicCorrection, rawResponse } = params;
  const estimatedKey = estimateKeySignatureFromChords(chordNames);

  return {
    primaryKey: estimatedKey.keySignature,
    modulation: null,
    originalChords: includeEnharmonicCorrection ? chordNames : undefined,
    correctedChords: includeEnharmonicCorrection ? chordNames : undefined,
    corrections: includeEnharmonicCorrection ? {} : undefined,
    sequenceCorrections: null,
    romanNumerals: null,
    rawResponse,
    fromHeuristicFallback: true,
  };
}

// Helper function to check cache for key detection
async function checkKeyDetectionCache(cacheKey: string): Promise<KeyDetectionCacheEntry | null> {
  try {
    const docRef = doc(firestoreDb, 'keyDetections', cacheKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as KeyDetectionCacheEntry;
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

    const cacheData: KeyDetectionCacheEntry = {
      primaryKey: keyResult.primaryKey,
      modulation: keyResult.modulation ?? null,
      corrections: keyResult.corrections || {},
      // Ensure sequence corrections are properly stored
      sequenceCorrections: keyResult.sequenceCorrections ? {
        originalSequence: keyResult.sequenceCorrections.originalSequence || [],
        correctedSequence: keyResult.sequenceCorrections.correctedSequence || [],
        keyAnalysis: keyResult.sequenceCorrections.keyAnalysis || undefined
      } : null,
      // Ensure Roman numerals are properly stored
      romanNumerals: keyResult.romanNumerals ? {
        analysis: keyResult.romanNumerals.analysis || [],
        keyContext: keyResult.romanNumerals.keyContext || '',
        temporalShifts: keyResult.romanNumerals.temporalShifts || []
      } : null
    };

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
    const { chords, includeEnharmonicCorrection = false, bypassCache = false, geminiApiKey, includeRomanNumerals = false } = await request.json();

    // API call tracking for optimization monitoring
    console.log('🔍 [API] Key detection request:', {
      chordsCount: chords?.length || 0,
      includeEnharmonicCorrection,
      includeRomanNumerals,
      bypassCache
    });

    if (!chords || !Array.isArray(chords) || chords.length === 0) {
      return NextResponse.json(
        { error: 'Invalid chord progression data' },
        { status: 400 }
      );
    }

    // Generate cache key (include enharmonic and Roman numeral flags in cache key)
    const cacheKey = generateKeyDetectionCacheKey(chords, includeEnharmonicCorrection, includeRomanNumerals);
    const chordNames = chords.map((chord: ChordData) => {
      if (typeof chord === 'string') {
        return chord;
      }
      return chord.chord || String(chord);
    });

    // Check cache first (unless bypassed for testing)
    console.log('🔍 [CACHE] Checking cache for key:', cacheKey.substring(0, 20) + '...');
    const cachedResult = bypassCache ? null : await checkKeyDetectionCache(cacheKey);
    if (cachedResult && !bypassCache) {
      console.log('✅ [CACHE] Cache hit - returning cached result');
      // Extract chord names for fallback if enharmonic correction data is missing
      const sanitizedSequenceCorrections = cachedResult.sequenceCorrections
        ? sanitizeSequenceCorrections(chordNames, cachedResult.sequenceCorrections)
        : null;
      const normalizedCorrections = {
        ...buildLegacyCorrections(sanitizedSequenceCorrections),
        ...sanitizeLegacyCorrections(chordNames, cachedResult.corrections || {})
      };
      const correctedChords = includeEnharmonicCorrection
        ? buildCorrectedChordSequence(chordNames, normalizedCorrections, sanitizedSequenceCorrections)
        : undefined;

      return NextResponse.json({
        primaryKey: cachedResult.primaryKey,
        modulation: cachedResult.modulation,
        // Keep API compatibility by deriving these fields from request/cached analysis when needed.
        originalChords: includeEnharmonicCorrection ? chordNames : undefined,
        correctedChords,
        corrections: normalizedCorrections,
        // ENHANCED: Include sequence corrections from cache with proper structure
        sequenceCorrections: sanitizedSequenceCorrections,
        // Include Roman numeral analysis from cache
        romanNumerals: cachedResult.romanNumerals || null,
        fromCache: true,
      });
    } else {
      console.log('❌ [CACHE] Cache miss - proceeding to Gemini API');
    }

    // Create a Gemini AI instance only after the cache lookup misses.
    // User-provided key takes precedence over environment variable.
    const geminiAI = createGeminiClient({
      apiKey: geminiApiKey,
      timeoutMs: maxDuration * 1000
    });
    if (!geminiAI) {
      console.error('Gemini API key is missing');
      return NextResponse.json(buildHeuristicKeyDetectionResult({
        chordNames,
        includeEnharmonicCorrection,
      }));
    }

    // Format chord progression for AI analysis
    const chordProgression = chords
      .map((chord: ChordData, index: number) => {
        const timestamp = chord.time ? `${chord.time.toFixed(2)}s` : `${index}`;
        return `${timestamp}: ${chord.chord || chord}`;
      })
      .join(', ');

    let prompt: string;

    if (includeEnharmonicCorrection || includeRomanNumerals) {
      // Enhanced prompt for context-aware sequence-based enharmonic correction and Roman numeral analysis
      const chordSequence = chordNames.filter(chord => chord && chord !== 'N.C.' && chord !== 'N/C');

      const analysisType = includeEnharmonicCorrection && includeRomanNumerals
        ? "enharmonic spelling corrections AND Roman numeral analysis"
        : includeEnharmonicCorrection
        ? "ONLY enharmonic spelling corrections (like C# ↔ Db, F# ↔ Gb) based on key context. DO NOT change chord qualities or functions"
        : "Roman numeral analysis";

      prompt = `Analyze this chord progression sequence and provide ${analysisType}.

CHORD SEQUENCE (in order): [${chordSequence.join(', ')}]

TIMING INFORMATION: ${chordProgression}

INPUT NOTATION:
- Chords use Harte-style symbols such as "F#:maj", "Bb:min7", "C#:7", "F#:maj/3", and "C#:7/b7".
- If the input uses slash-degree inversion notation (for example /3, /5, /b7, /2), preserve that suffix exactly in chord-symbol outputs.
- Example: "F#:maj/3" may become "Gb:maj/3" in a flat context, but not "Gb:maj/Bb" and not figure-bass notation.
- If the input uses a slash-note chord symbol (for example "D/F#"), keep it as a slash-note chord symbol.

Please respond with ONLY a JSON object in this exact format:
{
  "primaryKey": "[Key Name]",
  "modulation": "[Key Name]" or null,${includeEnharmonicCorrection ? `
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
  },` : ''}${includeRomanNumerals ? `
  "romanNumerals": {
    "analysis": ["I", "vi", "IV", "V7", "I"],
    "keyContext": "C major",
    "temporalShifts": [
      {
        "chordIndex": 3,
        "targetKey": "A minor",
        "romanNumeral": "V7|vi"
      }
    ]
  }` : ''}
}

	OUTPUT REPRESENTATION RULES:
	- The fields "sequenceCorrections.correctedSequence", "sequenceCorrections.keyAnalysis.sections[].chords", and "corrections" must contain CHORD SYMBOLS, not Roman numerals.
	- Preserve inversion slash notation in chord symbols. Slash-degree inputs must stay slash-degree; slash-note inputs must stay slash-note.
	- If the input chord is "F#:maj/3", the corrected chord symbol in a flat context should be "Gb:maj/3".
	- If the input chord is "D/F#", the corrected chord symbol must stay slash-based, such as "D/F#" (or an enharmonic respelling of the same pitches if absolutely needed).
	- NEVER convert a chord symbol into figure-bass shorthand. For chord-symbol outputs, do NOT rewrite "D/F#" as "D6", "D64", "D65", "IV6", or any other Roman numeral / figured-bass label.
	- Roman numeral inversion notation belongs ONLY inside "romanNumerals.analysis" and "romanNumerals.temporalShifts[*].romanNumeral".
	- Example: chord symbol output = "F#:maj/3" -> "Gb:maj/3"; Roman numeral output may be "I6" or "IV6" depending on the local key context. Keep these as separate representations.

${includeEnharmonicCorrection ? `
KEY ANALYSIS AND MODULATION MARKERS (required in "sequenceCorrections.keyAnalysis"):
- "sections" must cover the full chord index range 0 through (length of originalSequence minus 1) without gaps or overlaps; each section lists the local key and the slice of corrected chord symbols for that span.
- Whenever the governing key changes for a sustained stretch (true modulation or new tonal center, not a one- or two-chord tonicization), you MUST append an object to "modulations" with "fromKey", "toKey", and "atIndex" equal to the first chord index where the new key clearly governs the harmony.
- Indexing: "atIndex" is 0-based and matches the position in "originalSequence" / "correctedSequence" (same order as the CHORD SEQUENCE list at the top of this prompt). It must satisfy 0 <= atIndex < length(originalSequence).
- If there is no modulation, set "modulations" to [].
- Brief secondary-dominant or borrowed-chord tonicizations belong in "romanNumerals.temporalShifts" / bar notation when Roman analysis is requested; use "modulations" only for clear, section-level key changes.

` : ''}${includeRomanNumerals ? `
ROMAN NUMERAL ANALYSIS INSTRUCTIONS:
1. **STANDARD NOTATION**: Use standard Roman numerals (I, ii, iii, IV, V, vi, vii°). Use uppercase for major-quality chords, lowercase for minor-quality chords, and include chord figures such as V7 when needed.

	2. **INVERSIONS**: Use proper figure-bass notation in Roman numeral fields only.
   - Triads: root position = no figures, first inversion = 6, second inversion = 64.
   - Seventh chords: root position = 7, first inversion = 65, second inversion = 43, third inversion = 42.
	   - NEVER use slash notation (I/D, V/B) inside Roman numeral fields; use figure bass instead.
	   - This applies ONLY to Roman numeral analysis. It does NOT permit changing chord-symbol outputs like "F#:maj/3" into "I6" or "D/F#" into "D6".

3. **TEMPORARY TONAL SHIFTS**: Use bar notation for tonicization, such as "V7|vi". The frontend will display this as "V7/vi".

4. **KEY CONTEXT**: Use Roman numerals relative to the active tonal center, marking primary key and temporary modulations when needed.

5. **CHORD MAPPING**: Provide one Roman numeral per chord in sequence.
   - Array length must match the chord sequence length.
   - Use "N.C." for no-chord sections.
   - Mark unclear analysis with "?" (for example "V7?").

` : ''}${includeEnharmonicCorrection ? `
ENHARMONIC CORRECTION INSTRUCTIONS:` : ''}
1. **SAME PITCH REQUIREMENT**: Only change note spelling, never pitch, chord quality, inversion function, or harmonic function.
   - Valid same-pitch respellings include C#↔Db, D#↔Eb, F#↔Gb, G#↔Ab, A#↔Bb.
   - Never change to a different pitch class. Example: "G#dim" may become "Abdim", but never "A#dim".

2. **PRESERVE BASS MOTION AND SLASH FUNCTION**: The sounding bass motion must remain identical.
   - Preserve slash-note chords as slash-note chords and slash-degree chords as slash-degree chords.
   - Keep the same inversion meaning. Example: "D/F#" must stay slash-based; "F#:maj/3" may become "Gb:maj/3", not "Gb:maj/Bb" and not "D6".

3. **KEEP CHORD QUALITY AND SUFFIXES EXACTLY**:
   - "F#7" may become "Gb7", but never "F7" or "F#maj7".
   - "C#m" may become "Dbm", but never "C#" or "Dm".
   - Keep Harte notation shape when present. Example: "C#:maj" → "Db:maj", "F#:maj/3" → "Gb:maj/3", "C#:7/b7" → "Db:7/b7".

4. **KEY SIGNATURE OPTIMIZATION**: Prefer the enharmonic spelling with fewer accidentals while keeping the section internally consistent.
   - Prefer Db major over C# major.
   - Prefer B major over Cb major.

	5. **LOCAL KEY / CHORD SPELLING CONSISTENCY**: Keep local key names and corrected chord spellings in the same enharmonic system.
	   - If a section is flat-based (for example Ab, Db, Eb, Gb), corrected chords in that section should also be flat-based when an equivalent respelling exists.
	   - If a section is sharp-based (for example G#, C#, D#), corrected chords in that section should also be sharp-based when an equivalent respelling exists.
	   - Do not mix sharp and flat spellings within the same local section when the same-pitch respelling can be made consistent.

	6. **CONSERVATIVE APPROACH**: When uncertain, preserve the original spelling unless it conflicts with the chosen local key spelling or creates mixed enharmonic notation within the same section.

VALID CORRECTION EXAMPLES:
- "C#m" → "Dbm"
- "F#7" → "Gb7"
- "F#:maj/3" → "Gb:maj/3"

INVALID CORRECTION EXAMPLES:
- "G#dim" → "A#dim"
- "F#:maj/3" → "Gb:maj/Bb"
- "C" → "Cm"

Note: Decide carefully between major and minor.
- Choose minor only with clear evidence such as raised leading-tone behavior.
- Consider both the opening chord and the ending chord.
- Prefer the key interpretation that best fits the full progression.

Respond with ONLY the JSON object, no explanations.`;
    } else {
      // Original prompt for key detection only
      prompt = `Analyze the following chord progression and determine the musical key and any modulations.

Chord progression: ${chordProgression}

Please analyze carefully the tonality and provide ONLY the mostly likely key and modulation information in this exact format:
Primary Key: **[Key Name]**
Possible Tonal Modulation: **[Key Name]** (around [timestamp]) OR **None**
Note: Based on the chords, a key may be classified as either major or natural minor.
- To classify a key as minor, you need clear evidence, such as accidentals raising the leading tone.
- For example, when deciding between B♭ major and G minor, unless there are chords containing the F# tone (such as D major) within the song, it is more likely B♭ major.
- Consider both the opening chord and the final chord for justification.
- Do not overlook the decision between major and minor; choose the one that best fits the musical context.
Important: Do not include any explanations, analysis, or additional text. Just give me the key and possible tonal modulation information in the specified format.`;
    }

    console.log('Sending key detection request to Gemini API');

    // Generate content using the Gemini model
    console.log('🚀 [GEMINI] Sending key detection request to Gemini API');
    try {
      const response = await geminiAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
      });
      console.log('✅ [GEMINI] Received response from Gemini API');

      // Extract and clean the response text
      const text = response.text?.trim() || '';

      let result: KeyDetectionResult;

      if (includeEnharmonicCorrection || includeRomanNumerals) {
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

          // Handle both new sequence-based format and legacy format
          if (jsonResponse.sequenceCorrections) {
            const sequenceCorrections = sanitizeSequenceCorrections(chordNames, jsonResponse.sequenceCorrections);
            const legacyCorrections = {
              ...buildLegacyCorrections(sequenceCorrections),
              ...sanitizeLegacyCorrections(chordNames, jsonResponse.corrections || {})
            };
            const correctedSequence = buildCorrectedChordSequence(chordNames, legacyCorrections, sequenceCorrections);

            result = {
              primaryKey: jsonResponse.primaryKey || 'Unknown',
              modulation: jsonResponse.modulation || null,
              originalChords: chordNames,
              correctedChords: correctedSequence,
              corrections: legacyCorrections,
              sequenceCorrections: sequenceCorrections,
              romanNumerals: jsonResponse.romanNumerals || null,
              rawResponse: text
            };
          } else {
            const corrections = sanitizeLegacyCorrections(chordNames, jsonResponse.corrections || {});
            const correctedChords = chordNames.map(chord => corrections[chord] || chord);

            result = {
              primaryKey: jsonResponse.primaryKey || 'Unknown',
              modulation: jsonResponse.modulation || null,
              originalChords: chordNames,
              correctedChords: correctedChords,
              corrections: corrections,
              romanNumerals: jsonResponse.romanNumerals || null,
              rawResponse: text
            };
          }
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError);
          const primaryKeyMatch = text.match(/Primary Key:\s*\*\*([^*]+)\*\*/);
          const modulationMatch = text.match(/Possible Tonal Modulation:\s*\*\*([^*]+)\*\*/);

          result = {
            primaryKey: primaryKeyMatch ? primaryKeyMatch[1].trim() : 'Unknown',
            modulation: modulationMatch ? modulationMatch[1].trim() === 'None' ? null : modulationMatch[1].trim() : null,
            originalChords: chordNames,
            correctedChords: chordNames,
            corrections: {},
            romanNumerals: null,
            rawResponse: text
          };
        }
      } else {
        const primaryKeyMatch = text.match(/Primary Key:\s*\*\*([^*]+)\*\*/);
        const modulationMatch = text.match(/Possible Tonal Modulation:\s*\*\*([^*]+)\*\*/);

        result = {
          primaryKey: primaryKeyMatch ? primaryKeyMatch[1].trim() : 'Unknown',
          modulation: modulationMatch ? modulationMatch[1].trim() === 'None' ? null : modulationMatch[1].trim() : null,
          rawResponse: text
        };
      }

      if (!result.primaryKey || result.primaryKey === 'Unknown') {
        return NextResponse.json(buildHeuristicKeyDetectionResult({
          chordNames,
          includeEnharmonicCorrection,
          rawResponse: text,
        }));
      }

      await saveKeyDetectionToCache(cacheKey, result);
      return NextResponse.json(result);
    } catch (geminiError) {
      console.error('Gemini key detection failed, using heuristic fallback:', geminiError);
      return NextResponse.json(buildHeuristicKeyDetectionResult({
        chordNames,
        includeEnharmonicCorrection,
      }));
    }

  } catch (error) {
    console.error('Error detecting key:', error);
    return NextResponse.json(
      { error: 'Failed to detect musical key' },
      { status: 500 }
    );
  }
}
