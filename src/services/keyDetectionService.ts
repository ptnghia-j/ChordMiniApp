export interface KeyDetectionResult {
  primaryKey: string;
  modulation: string | null;
  rawResponse?: string;
  originalChords?: string[];
  correctedChords?: string[];
  corrections?: Record<string, string>;
  // NEW: Enhanced sequence-based correction data
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
        atTime?: number;
      }>;
    };
  };
}

export interface ChordData {
  chord: string;
  time: number;
}

/**
 * Detect the musical key and modulations from a chord progression
 */
export async function detectKey(chords: ChordData[], includeEnharmonicCorrection: boolean = false, bypassCache: boolean = false): Promise<KeyDetectionResult> {
  try {
    const response = await fetch('/api/detect-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chords,
        includeEnharmonicCorrection,
        bypassCache
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error detecting key:', error);
    throw new Error('Failed to detect musical key');
  }
}

/**
 * Format key information for display
 */
export function formatKeyInfo(keyResult: KeyDetectionResult): string {
  if (!keyResult.primaryKey || keyResult.primaryKey === 'Unknown') {
    return 'Key: Unknown';
  }

  let keyInfo = `Key: ${keyResult.primaryKey}`;
  
  if (keyResult.modulation && keyResult.modulation !== 'None') {
    keyInfo += ` → ${keyResult.modulation}`;
  }

  return keyInfo;
}

/**
 * Extract key name without additional formatting
 */
export function extractKeyName(keyResult: KeyDetectionResult): string {
  return keyResult.primaryKey || 'Unknown';
}
