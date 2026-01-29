/**
 * Song Segmentation Service
 * 
 * This service handles song structure analysis using Gemini LLM to identify
 * different sections (intro, verse, chorus, bridge, etc.) with precise timestamps.
 */

import { GoogleGenAI } from '@google/genai';
import { SongContext, SegmentationResult, SegmentationRequest, SongSegment } from '@/types/chatbotTypes';

// Gemini model configuration
const MODEL_NAME = 'gemini-2.5-pro';

/**
 * Creates a comprehensive prompt for song segmentation analysis
 */
function createSegmentationPrompt(songContext: SongContext): string {
  const {
    title,
    duration,
    beats,
    synchronizedChords,
    lyrics,
    bpm,
    time_signature
  } = songContext;

  // Enhanced beat information with complete timestamp array
  const beatInfo = beats ? `
Beat Information:
- Total beats: ${beats.length}
- BPM: ${bpm || 'Unknown'}
- Time signature: ${time_signature === 6 ? '6/8' : `${time_signature || 4}/4`}
- Complete beat timestamps: ${beats.map((beat, i) => `${i}: ${typeof beat === 'number' && !isNaN(beat) ? (beat as number).toFixed(2) : 'N/A'}s`).join(', ')}
` : '';

  // Enhanced chord progression with complete data and timestamps
  const chordInfo = synchronizedChords ? `
Complete Chord Progression with Timestamps (${synchronizedChords.length} chords total):
${synchronizedChords.map(chord => {
  const beatTime = beats?.[chord.beatIndex];
  const timeStr = typeof beatTime === 'number' && !isNaN(beatTime) ? (beatTime as number).toFixed(2) : 'N/A';
  return `${timeStr}s: ${chord.chord} (Beat ${chord.beatIndex})`;
}).join('\n')}
` : '';

  // Enhanced lyrics with complete timestamps and gap analysis for instrumental detection
  const lyricsInfo = lyrics?.lines ? `
Complete Lyrics with Timestamps and Gap Analysis (${lyrics.lines.length} lines total):
${lyrics.lines.map((line, index) => {
  const nextLine = lyrics.lines[index + 1];
  const gap = nextLine && line.endTime && nextLine.startTime
    ? (nextLine.startTime - line.endTime).toFixed(2)
    : null;
  const gapInfo = gap && parseFloat(gap) > 3 ? ` [GAP: ${gap}s - POTENTIAL INSTRUMENTAL SECTION]` : '';
  return `${line.startTime?.toFixed(2) || 'N/A'}s - ${line.endTime?.toFixed(2) || 'N/A'}s: "${line.text}"${gapInfo}`;
}).join('\n')}
` : '';

  return `You are an expert music analyst. Analyze the following song data to identify structural sections with precise timestamps.

SONG: ${title || 'Unknown Title'}
DURATION: ${duration ? `${duration.toFixed(2)} seconds` : 'Unknown'}

${beatInfo}
${chordInfo}
${lyricsInfo}

TASK: Identify song sections (intro, verse, pre-chorus, chorus, bridge, outro, instrumental, solo, breakdown) with precise start and end timestamps.
Hint: Focus on the overall musical form using both lyrics and harmony.

- Use lyrics to identify structure of the song.
- Use chord progressions, key changes, and rhythmic shifts to support section boundaries.
- Label instrumental parts where lyrics are absent, based on musical context. Try to avoid short sections (less than 5 seconds) unless supported by clear musical cues.
- Ensure complete coverage with no gaps and seamless transitions between segments.
- Segment order should follow typical song structure order.

ANALYSIS GUIDELINES (in order of priority):
1. **PRIMARY: Lyrics Content Analysis and Song segment order**
  - Identify intro/outro sections by analyzing lyrical content at the beginning and end of the song
  - Intro: 
    + Always comes first (or omitted entirely). 
    + May lead directly into Verse, Pre‑Chorus, or Chorus.
  - Outro: 
    + Always comes last (or omitted entirely). 
    + May follow Chorus, Bridge, or Solo.

  - Identify verses by analyzing lyrical themes, narrative progression, and unique content
  - Verse: 
    + Introduces lyrical/melodic ideas.
    + Can repeat (e.g. Verse 2, Verse 3) but should follow Chorus or Intro.

  - Identify pre-choruses by finding lyrical content that builds tension before the chorus
  - Pre‑Chorus:
    + Must immediately precede a Chorus.
    + Cannot be followed by any other segment (no Verse, Bridge, Solo, etc.)

  - Identify choruses by finding repeated lyrical phrases, hooks, and memorable lines
  - Chorus
    + Must immediately follow a Pre‑Chorus (unless it follows a Verse directly in “Verse → Chorus” form).
    + Can repeat back‑to‑back or be followed by a Post‑Chorus.

  - Identify bridges by finding contrasting lyrical content or perspective shifts
  - Bridge:
    + Appears later (commonly after 2× Verse–Chorus cycles).
    + Cannot be inserted mid Verse/Chorus or Pre‑Chorus/Chorus pairs.

  - Instrumental
    + Gaps between lyrics lines (>= 10 seconds) as potential instrumental sections
    + Often sits after Chorus, or after Bridge.
    + Should not split Pre‑Chorus → Chorus sequence

2. **SECONDARY: Musical Structure Analysis**
  - Use chord progression changes as supporting evidence for section boundaries
  - Consider rhythmic patterns and beat positions for section transitions
  - Look for key changes or tempo variations that indicate new sections
  - Based on your knowledge of typical song structures/forms of music, recheck and refine your initial analysis

3. **Complete Coverage Requirements**
  - CRITICAL: Ensure segments cover the ENTIRE song duration from 0 seconds to ${duration || 300} seconds
  - No gaps or unlabeled sections should exist between segments
  - Adjacent segments should connect seamlessly (end time of one = start time of next)
  - If uncertain about a section, label it as the most likely type with lower confidence

4. **Confidence and Reasoning**
  - Assign higher confidence (0.8-1.0) to sections with clear lyrical patterns
  - Use medium confidence (0.5-0.79) for sections identified primarily by musical cues
  - Use lower confidence (0.1-0.49) for ambiguous sections but still provide a label
  - Consider typical song structures but prioritize actual content analysis

OUTPUT FORMAT: Respond with ONLY a valid JSON object in this exact format:
{
  "segments": [
    {
      "type": "intro|verse|pre-chorus|chorus|bridge|outro|instrumental|solo|breakdown",
      "startTime": 0.0,
      "endTime": 15.5,
      "confidence": 0.85,
      "label": "Intro",
      "reasoning": "Brief explanation of why this section was identified (lyrical content, musical cues, etc.)"
    }
  ],
  "analysis": {
    "structure": "Detailed description of overall song structure and patterns found",
    "tempo": ${bpm || 120},
    "timeSignature": ${time_signature || 4},
    "coverageCheck": "Confirmation that all ${duration || 300} seconds are covered by segments"
  },
  "metadata": {
    "totalDuration": ${duration || 0},
    "analysisTimestamp": ${Date.now()},
    "model": "gemini-2.5-pro"
  }
}

CRITICAL REQUIREMENTS:
- **COMPLETE COVERAGE**: Segments MUST cover the entire song from 0 to ${duration || 300} seconds with NO GAPS
- **NO OVERLAPS**: Segments should not overlap (end time of segment N = start time of segment N+1)
- **CHRONOLOGICAL ORDER**: Segments must be in chronological order by start time
- **VALID TIMESTAMPS**: All timestamps must be within 0 to ${duration || 300} seconds
- **SEGMENT ORDER**: Follow typical song structure order (Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro). However any can omit section logically based on careful analysis
- **CONFIDENCE SCORES**: Use scores between 0.0 and 1.0 based on certainty of identification
- **REASONING**: Think carefully before declaring a section. Double check your analysis before finalizing a section. Provide brief reasoning for each segment identification
- **JSON ONLY**: Respond with ONLY the JSON object, no additional text or explanations outside the JSON`;
}

/**
 * Validates and cleans segmentation result from Gemini
 */
function validateSegmentationResult(result: unknown, duration: number): SegmentationResult | null {
  try {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result format');
    }

    const { segments, analysis } = result as Record<string, unknown>;

    if (!Array.isArray(segments)) {
      throw new Error('Segments must be an array');
    }

    // Validate and clean segments
    const validSegments: SongSegment[] = (segments as unknown[])
      .filter((segment: unknown) => {
        const seg = segment as Record<string, unknown>;
        return (
          seg &&
          typeof seg.type === 'string' &&
          typeof seg.startTime === 'number' &&
          typeof seg.endTime === 'number' &&
          seg.startTime >= 0 &&
          seg.endTime <= duration &&
          seg.startTime < seg.endTime
        );
      })
      .map((segment: unknown) => {
        const seg = segment as Record<string, unknown>;
        return {
          type: seg.type as string,
          startTime: Math.max(0, seg.startTime as number),
          endTime: Math.min(duration, seg.endTime as number),
          confidence: typeof seg.confidence === 'number' ? seg.confidence : 0.8,
          label: (seg.label as string) || (seg.type as string),
          reasoning: (seg.reasoning as string) || 'No reasoning provided'
        };
      })
      .sort((a, b) => a.startTime - b.startTime);

    // Remove overlapping segments and ensure complete coverage
    const cleanedSegments: SongSegment[] = [];
    for (const segment of validSegments) {
      const lastSegment = cleanedSegments[cleanedSegments.length - 1];
      if (!lastSegment || segment.startTime >= lastSegment.endTime) {
        cleanedSegments.push(segment);
      }
    }

    // Ensure complete coverage by filling gaps
    const finalSegments: SongSegment[] = [];
    for (let i = 0; i < cleanedSegments.length; i++) {
      const currentSegment = cleanedSegments[i];
      const previousSegment = finalSegments[finalSegments.length - 1];

      // Fill gap before first segment
      if (i === 0 && currentSegment.startTime > 0) {
        finalSegments.push({
          type: 'intro',
          startTime: 0,
          endTime: currentSegment.startTime,
          confidence: 0.5,
          label: 'Intro (Auto-filled)',
          reasoning: 'Auto-filled gap at beginning of song'
        });
      }

      // Fill gap between segments
      if (previousSegment && currentSegment.startTime > previousSegment.endTime) {
        const gapDuration = currentSegment.startTime - previousSegment.endTime;
        finalSegments.push({
          type: gapDuration > 10 ? 'instrumental' : 'transition',
          startTime: previousSegment.endTime,
          endTime: currentSegment.startTime,
          confidence: 0.4,
          label: gapDuration > 10 ? 'Instrumental (Auto-filled)' : 'Transition (Auto-filled)',
          reasoning: `Auto-filled ${gapDuration.toFixed(2)}s gap between segments`
        });
      }

      finalSegments.push(currentSegment);
    }

    // Fill gap after last segment
    const lastSegment = finalSegments[finalSegments.length - 1];
    if (lastSegment && lastSegment.endTime < duration) {
      finalSegments.push({
        type: 'outro',
        startTime: lastSegment.endTime,
        endTime: duration,
        confidence: 0.5,
        label: 'Outro (Auto-filled)',
        reasoning: 'Auto-filled gap at end of song'
      });
    }

    const analysisData = analysis as Record<string, unknown> | undefined;
    return {
      segments: finalSegments,
      analysis: {
        structure: (analysisData?.structure as string) || 'Unknown structure',
        tempo: (analysisData?.tempo as number) || 120,
        timeSignature: (analysisData?.timeSignature as number) || 4,
        coverageCheck: `Complete coverage: ${finalSegments.length} segments covering 0-${duration}s`
      },
      metadata: {
        totalDuration: duration,
        analysisTimestamp: Date.now(),
        model: 'gemini-segmentation-v2-enhanced'
      }
    };
  } catch (error) {
    console.error('Error validating segmentation result:', error);
    return null;
  }
}

/**
 * Performs song segmentation analysis using Gemini LLM
 */
export async function analyzeSongSegmentation(request: SegmentationRequest): Promise<SegmentationResult> {
  const { songContext, geminiApiKey } = request;

  // Validate input
  if (!songContext) {
    throw new Error('Song context is required for segmentation analysis');
  }

  if (!songContext.beats || songContext.beats.length === 0) {
    throw new Error('Beat data is required for segmentation analysis');
  }

  if (!songContext.lyrics || songContext.lyrics.lines.length === 0) {
    throw new Error('Lyrics data is required for segmentation analysis');
  }

  // Validate or calculate duration
  let actualDuration = songContext.duration;
  if (!actualDuration || actualDuration <= 0) {
    // Try to calculate duration from beat data
    if (songContext.beats && songContext.beats.length > 0) {
      const lastBeat = songContext.beats[songContext.beats.length - 1];
      if (typeof lastBeat === 'number' && lastBeat > 0) {
        actualDuration = lastBeat + 2; // Add 2 seconds buffer after last beat
      }
    }

    // If still no duration, use fallback
    if (!actualDuration || actualDuration <= 0) {
      actualDuration = 300; // 5 minutes fallback
    }
  }

  // Initialize Gemini API
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is required for segmentation analysis');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 120000 // 120 seconds timeout (maximum allowed)
    }
  });

  try {
    // Create segmentation prompt with corrected duration
    const correctedSongContext = {
      ...songContext,
      duration: actualDuration
    };
    const prompt = createSegmentationPrompt(correctedSongContext);
    console.log('Sending segmentation request to Gemini...');

    // Generate segmentation analysis
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: prompt }] }]
    });

    // Extract response text with proper error handling
    const responseText = response.text?.trim() || '';
    if (!responseText) {
      throw new Error('Gemini API returned empty response');
    }
    console.log('Received segmentation response from Gemini');

    // Parse JSON response
    let parsedResult;
    try {
      // Clean the response text to extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      throw new Error('Failed to parse segmentation response from Gemini');
    }

    // Validate and clean the result using the calculated actual duration
    const validatedResult = validateSegmentationResult(parsedResult, actualDuration);

    if (!validatedResult) {
      throw new Error('Invalid segmentation result from Gemini');
    }

    console.log(`Successfully analyzed song segmentation: ${validatedResult.segments.length} segments identified`);
    return validatedResult;

  } catch (error) {
    console.error('Error in song segmentation analysis:', error);
    throw new Error(`Segmentation analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Maps beat indices to segment types for color coding
 */
export function mapBeatsToSegments(
  beats: (number | null)[], 
  segments: SongSegment[]
): Array<{ beatIndex: number; segmentType: string; segmentLabel?: string }> {
  const beatSegmentMap: Array<{ beatIndex: number; segmentType: string; segmentLabel?: string }> = [];

  beats.forEach((beatTime, beatIndex) => {
    if (beatTime === null || beatTime === undefined) {
      return;
    }

    // Find which segment this beat belongs to
    const segment = segments.find(seg => 
      beatTime >= seg.startTime && beatTime < seg.endTime
    );

    if (segment) {
      beatSegmentMap.push({
        beatIndex,
        segmentType: segment.type,
        segmentLabel: segment.label
      });
    }
  });

  return beatSegmentMap;
}

/**
 * Gets color scheme for segment types
 */
export function getSegmentColor(segmentType: string): { bg: string; border: string; text: string } {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    intro: { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-600', text: 'text-blue-800 dark:text-blue-200' },
    verse: { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-600', text: 'text-green-800 dark:text-green-200' },
    'pre-chorus': { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-300 dark:border-orange-600', text: 'text-orange-800 dark:text-orange-200' },
    chorus: { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-600', text: 'text-red-800 dark:text-red-200' },
    bridge: { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-300 dark:border-purple-600', text: 'text-purple-800 dark:text-purple-200' },
    outro: { bg: 'bg-gray-100 dark:bg-gray-700', border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-800 dark:text-gray-200' },
    instrumental: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-300 dark:border-yellow-600', text: 'text-yellow-800 dark:text-yellow-200' },
    solo: { bg: 'bg-pink-100 dark:bg-pink-900/30', border: 'border-pink-300 dark:border-pink-600', text: 'text-pink-800 dark:text-pink-200' },
    breakdown: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-300 dark:border-indigo-600', text: 'text-indigo-800 dark:text-indigo-200' }
  };

  return colorMap[segmentType] || colorMap.verse;
}
