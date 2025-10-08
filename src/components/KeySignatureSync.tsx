/**
 * KeySignatureSync Component
 * 
 * Synchronizes the detected key signature with the originalKey in UIContext
 * for proper pitch shift transposition calculations.
 */

'use client';

import { useEffect } from 'react';
import { useUI } from '@/contexts/UIContext';

interface KeySignatureSyncProps {
  keySignature: string | null;
}

export const KeySignatureSync: React.FC<KeySignatureSyncProps> = ({ keySignature }) => {
  const { setOriginalKey } = useUI();

  useEffect(() => {
    if (keySignature) {
      // Extract just the note name from the key signature
      // e.g., "E♭ major" -> "E♭", "C# minor" -> "C#"
      const noteName = keySignature.split(' ')[0];
      setOriginalKey(noteName);
    }
  }, [keySignature, setOriginalKey]);

  return null; // This component doesn't render anything
};

export default KeySignatureSync;

