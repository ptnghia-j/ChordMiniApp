export interface KeyDetectionResult {
  primaryKey: string;
  modulation: string | null;
  rawResponse?: string;
}

export interface ChordData {
  chord: string;
  time: number;
}

/**
 * Detect the musical key and modulations from a chord progression
 */
export async function detectKey(chords: ChordData[]): Promise<KeyDetectionResult> {
  try {
    const response = await fetch('/api/detect-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chords }),
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
