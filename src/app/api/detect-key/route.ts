import { NextRequest, NextResponse } from 'next/server';
import { ThinkingLevel } from '@google/genai';
import { firestoreDb } from '@/services/firebase/firebaseService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';
import { createGeminiClient, GEMINI_MODEL_NAME } from '@/config/gemini';
import { sanitizeLegacyCorrections, sanitizeSequenceCorrections } from '@/utils/keyDetectionCorrections';

export const maxDuration = 240; // 4 minutes for key detection processing

// Define the model name to use
const MODEL_NAME = GEMINI_MODEL_NAME;
const KEY_DETECTION_PROMPT_VERSION = 'v3-enharmonic-key-consistency';

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

    // Check cache first (unless bypassed for testing)
    console.log('🔍 [CACHE] Checking cache for key:', cacheKey.substring(0, 20) + '...');
    const cachedResult = bypassCache ? null : await checkKeyDetectionCache(cacheKey);
    if (cachedResult && !bypassCache) {
      console.log('✅ [CACHE] Cache hit - returning cached result');
      // Extract chord names for fallback if enharmonic correction data is missing
      const chordNames = chords.map((chord: ChordData) => {
        if (typeof chord === 'string') {
          return chord;
        }
        return chord.chord || String(chord);
      });

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
        fromCache: true
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
      return NextResponse.json(
        { error: 'Key detection service is not configured properly. Please provide a Gemini API key.' },
        { status: 500 }
      );
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
	- Preserve inversion slash notation in chord symbols. If the input chord is "D/F#", the corrected chord symbol must stay slash-based, such as "D/F#" (or an enharmonic respelling of the same pitches if absolutely needed).
	- NEVER convert a chord symbol into figure-bass shorthand. For chord-symbol outputs, do NOT rewrite "D/F#" as "D6", "D64", "D65", "IV6", or any other Roman numeral / figured-bass label.
	- Roman numeral inversion notation belongs ONLY inside "romanNumerals.analysis" and "romanNumerals.temporalShifts[*].romanNumeral".
	- Example: chord symbol output = "D/F#"; Roman numeral output may be "I6" or "IV6" depending on the local key context. Keep these as separate representations.

${includeRomanNumerals ? `
ROMAN NUMERAL ANALYSIS INSTRUCTIONS:
1. **STANDARD NOTATION**: Use standard music theory Roman numerals (I, ii, iii, IV, V, vi, vii°)
   - Major chords: I, IV, V (uppercase)
   - Minor chords: ii, iii, vi (lowercase)
   - Diminished chords: vii° (lowercase with degree symbol)
   - Seventh chords: V7, ii7, etc.

	2. **INVERSIONS**: Use proper figure bass notation for ALL inversions in the Roman numeral fields only
   **TRIADS:**
   - Root position: I, ii, iii, IV, V, vi, vii° (no figures)
   - First inversion: I6, ii6, iii6, IV6, V6, vi6, vii°6 (NOT I/3 or I/E)
   - Second inversion: I64, ii64, iii64, IV64, V64, vi64, vii°64 (NOT I/5 or I/G)

   **SEVENTH CHORDS:**
   - Root position: I7, ii7, iii7, IV7, V7, vi7, vii°7 (figure 7)
   - First inversion: I65, ii65, iii65, IV65, V65, vi65, vii°65 (NOT I7/3)
   - Second inversion: I43, ii43, iii43, IV43, V43, vi43, vii°43 (NOT I7/5)
   - Third inversion: I42, ii42, iii42, IV42, V42, vi42, vii°42 (NOT I7/7)

	   **CRITICAL**: NEVER use slash notation (I/D, V/B) inside the Roman numeral fields - ALWAYS use figure bass (I42, V6)
	   **IMPORTANT SEPARATION**: This rule applies ONLY to Roman numeral analysis. It does NOT permit changing chord-symbol outputs like "D/F#" into "D6".

3. **TEMPORARY TONAL SHIFTS**: Use bar notation for analysis, but note frontend conversion
   - Analysis format: V7|vi (V7 going to vi as temporary tonic)
   - Frontend will display as: V7/vi (fraction notation)
   - Example: In C major, E7 going to Am = V7|vi

4. **KEY CONTEXT**: Focus on the local key and temporary modulations
   - Identify the primary key context
   - Mark temporary shifts to related keys (relative minor/major, dominant, subdominant)
   - Use Roman numerals relative to the current tonal center

5. **CHORD MAPPING**: Provide Roman numeral for each chord in sequence
   - Array length must match the chord sequence length
   - Use "N.C." for no-chord sections
   - Mark unclear analysis with "?" (e.g., "V7?")

` : ''}${includeEnharmonicCorrection ? `
CRITICAL INSTRUCTIONS - ENHARMONIC CORRECTIONS ONLY:` : ''}
1. **SAME PITCH REQUIREMENT**: Only change note spelling, never the actual pitch
   - ENHARMONIC EQUIVALENTS (same pitch): C#↔Db, D#↔Eb, F#↔Gb, G#↔Ab, A#↔Bb
   - DIFFERENT PITCHES (never change): C≠C#, D≠D#, E≠F, F≠F#, G≠G#, A≠A#, B≠C
	   - Example: G#dim can become Abdim (G# and Ab are the same pitch) but NEVER A#dim (G# and A# are different pitches!)

2. **HARMONIC FUNCTION PRESERVATION**: The bass line progression must remain identical
	   - Original progression: E→F#→G#dim→G#m
	   - Valid correction: E→F#→Abdim→Abm (same sounding bass progression, respelled consistently for a flat context)
	   - INVALID correction: E→F#→A#dim→G#m (G# and A# are different pitches - changes harmonic function!)
	   - Be aware of walking bass lines and preserve the same sounding bass motion even when a double accidental or respelling is needed.
	   - For slash chords, preserve the same inversion / bass note function in chord-symbol output. Example: "D/F#" must remain a slash chord symbol, not "D6".

3. **CHORD QUALITY PRESERVATION**: Keep ALL chord qualities exactly unchanged
	   - "G#dim" stays "dim" quality, can become "Abdim" but never "A#dim" or "Gmaj"
   - "F#7" stays "7" quality, can become "Gb7" but never "F7" or "F#maj7"
   - "C#m" stays "m" quality, can become "Dbm" but never "C#" or "Dm"
	   - "D/F#" stays a slash-chord inversion symbol, can become something enharmonically equivalent like "D/Gb" only if the same sounding bass must be respelled, but never "D6"
		   - NEVER change a slash bass to a different pitch-class. Example: "A/B" may stay "A/B" or become an enharmonic equivalent like "A/Cb", but never "A/C#".

4. **KEY SIGNATURE OPTIMIZATION**: Choose spellings with less accidentals
   - Prefer Db major (5 flats) over C# major (7 sharps)
   - Prefer B major (5 sharps) over Cb major (7 flats)
	   - If a section could be labeled either with sharps or flats, choose the representation that minimizes accidentals AND keeps chord spellings internally consistent.

	5. **LOCAL KEY / CHORD SPELLING CONSISTENCY**: Keep the chosen local key name and corrected chord spellings in the SAME enharmonic system
	   - If you label a local section as a sharp key (for example G#, C#, D#), corrected chords in that section must also use sharp-based spellings when applicable.
	   - If you label a local section as a flat key (for example Ab, Db, Eb), corrected chords in that section must also use flat-based spellings when applicable.
	   - NEVER mix a sharp key label with flat-only corrected chords, or a flat key label with sharp-only corrected chords, if an equivalent same-pitch respelling exists.
	   - Example: if the local key is G#, use "E#m" instead of "Fm". If you want to keep "Fm", then the local key should be spelled as Ab-based instead.
	   - Apply the same consistency rule to modulation labels, section keys, corrected chord symbols, and Roman numeral key contexts.

	6. **CONSERVATIVE APPROACH**: When uncertain, preserve original spelling ONLY if it does not conflict with the chosen local key spelling or create mixed enharmonic notation within the same section.

VALID CORRECTION EXAMPLES (same pitch, different spelling):
- "C#m" → "Dbm" (C# and Db are the same pitch)
- "F#7" → "Gb7" (F# and Gb are the same pitch)
- "G#dim" → "Abdim" (G# and Ab are the same pitch)
- "A#" → "Bb" (A# and Bb are the same pitch)

INVALID CORRECTION EXAMPLES (NEVER DO - different pitches or qualities):
- "G#dim" → "A#dim" (G# and A# are DIFFERENT PITCHES!)
- "F" → "F#" (F and F# are DIFFERENT PITCHES!)
- "C" → "Cm" (changes chord quality)
- "F#7" → "F7" (F# and F are DIFFERENT PITCHES!)
- "Am" → "A" (removes chord quality)

Note: Based on the chords, a key may be classified as either major or natural minor.
- To classify a key as minor, you need clear evidence, such as accidentals raising the leading tone.
- For example, when deciding between B♭ major and G minor, unless there are chords containing the F# tone (such as D major) within the song, it is more likely B♭ major.
- Consider both the opening chord and the final chord for justification.
- Do not overlook the decision between major and minor; choose the one that best fits the musical context.

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
        // console.log('🔍 PARSED JSON RESPONSE:', {
        //   hasSequenceCorrections: !!jsonResponse.sequenceCorrections,
        //   hasCorrections: !!jsonResponse.corrections,
        //   primaryKey: jsonResponse.primaryKey,
        //   sequenceCorrectionsLength: jsonResponse.sequenceCorrections?.correctedSequence?.length || 0
        // });

        // Handle both new sequence-based format and legacy format
        if (jsonResponse.sequenceCorrections) {
          // NEW: Enhanced sequence-based corrections
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
          // LEGACY: Individual chord corrections (fallback)
          const corrections = sanitizeLegacyCorrections(chordNames, jsonResponse.corrections || {});

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
            romanNumerals: jsonResponse.romanNumerals || null,
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
          romanNumerals: null, // No Roman numerals if parsing failed
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
