import { useState, useCallback } from 'react';

// Types
interface ProcessedLyricLine {
  startTime: number;
  endTime: number;
  text: string;
  chords?: Array<{
    position: number;
    chord: string;
    time: number;
  }>;
  isInstrumental?: boolean;
  isChordOnly?: boolean;
  sectionLabel?: string;
  duration?: number;
  isCondensed?: boolean;
}

interface TranslatedLyrics {
  translatedLyrics: string;
  fromCache: boolean;
  backgroundUpdateInProgress?: boolean;
}

// Available languages for translation
const availableLanguages = [
  { code: 'English', name: 'English' },
  { code: 'Spanish', name: 'Spanish' },
  { code: 'French', name: 'French' },
  { code: 'German', name: 'German' },
  { code: 'Japanese', name: 'Japanese' },
  { code: 'Chinese', name: 'Chinese' },
  { code: 'Korean', name: 'Korean' },
  { code: 'Russian', name: 'Russian' }
];

// Hook interface
interface UseTranslationProps {
  processedLines: ProcessedLyricLine[];
  getApiKey: (service: 'musicAi' | 'gemini') => Promise<string | null>;
}

interface UseTranslationReturn {
  translatedLyrics: { [language: string]: TranslatedLyrics };
  isTranslating: boolean;
  translationError: string | null;
  selectedLanguages: string[];
  isLanguageMenuOpen: boolean;
  backgroundUpdatesInProgress: Set<string>;
  availableLanguages: typeof availableLanguages;
  translateLyrics: (targetLanguage: string) => Promise<void>;
  setSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  setIsLanguageMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Custom hook for managing lyrics translation
 * Extracted from LeadSheetDisplay component for better maintainability
 */
export const useTranslation = ({
  processedLines,
  getApiKey
}: UseTranslationProps): UseTranslationReturn => {
  // State for translations
  const [translatedLyrics, setTranslatedLyrics] = useState<{[language: string]: TranslatedLyrics}>({});
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState<boolean>(false);
  const [backgroundUpdatesInProgress, setBackgroundUpdatesInProgress] = useState<Set<string>>(new Set());

  // Function to translate lyrics to a specific language with cache-first approach
  const translateLyrics = useCallback(async (targetLanguage: string) => {
    if (!processedLines || processedLines.length === 0) {
      setTranslationError('No lyrics available to translate');
      return;
    }

    try {
      setIsTranslating(true);
      setTranslationError(null);

      // Combine all lyrics lines into a single string
      const lyricsText = processedLines.map(line => line.text).join('\n');

      // Get video ID from URL if available
      const videoId = typeof window !== 'undefined' ?
        new URLSearchParams(window.location.search).get('v') ||
        window.location.pathname.split('/').pop() :
        '';

      // Import the translation service dynamically to avoid SSR issues
      const { translateLyricsWithCache } = await import('@/services/translationService');

      // Get user's Gemini API key if available
      const geminiApiKey = await getApiKey('gemini');

      // Call the cache-first translation service
      const translationResponse = await translateLyricsWithCache(
        {
          lyrics: lyricsText,
          targetLanguage,
          videoId,
          geminiApiKey: geminiApiKey || undefined
        },
        // Background update callback
        (updatedTranslation) => {
          // Update the translations state with the fresh translation
          setTranslatedLyrics(prev => ({
            ...prev,
            [targetLanguage]: {
              translatedLyrics: updatedTranslation.translatedLyrics || '',
              fromCache: updatedTranslation.fromCache || false,
              backgroundUpdateInProgress: updatedTranslation.backgroundUpdateInProgress || false
            }
          }));

          // Remove from background updates tracking
          setBackgroundUpdatesInProgress(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetLanguage);
            return newSet;
          });
        }
      );

      // Update the translations state with the initial translation (cached or fresh)
      setTranslatedLyrics(prev => ({
        ...prev,
        [targetLanguage]: {
          translatedLyrics: translationResponse.translatedLyrics || '',
          fromCache: translationResponse.fromCache || false,
          backgroundUpdateInProgress: translationResponse.backgroundUpdateInProgress || false
        }
      }));

      // Add the language to selected languages if not already selected
      setSelectedLanguages(prev =>
        prev.includes(targetLanguage) ? prev : [...prev, targetLanguage]
      );

      // Track background updates
      if (translationResponse.fromCache) {
        // Track that a background update is in progress for this language
        if (translationResponse.backgroundUpdateInProgress) {
          setBackgroundUpdatesInProgress(prev => {
            const newSet = new Set(prev);
            newSet.add(targetLanguage);
            return newSet;
          });
        }
      }

    } catch (error) {
      console.error('Translation error:', error);
      setTranslationError(
        error instanceof Error ? error.message : 'Failed to translate lyrics'
      );
    } finally {
      setIsTranslating(false);
    }
  }, [processedLines, getApiKey]);

  return {
    translatedLyrics,
    isTranslating,
    translationError,
    selectedLanguages,
    isLanguageMenuOpen,
    backgroundUpdatesInProgress,
    availableLanguages,
    translateLyrics,
    setSelectedLanguages,
    setIsLanguageMenuOpen
  };
};
