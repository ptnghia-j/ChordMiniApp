import React from 'react';
import { Button, Popover, PopoverTrigger, PopoverContent, Slider } from '@heroui/react';
import { HiGlobeAlt } from 'react-icons/hi';

// Types
interface TranslatedLyrics {
  translatedLyrics: string;
  fromCache: boolean;
  backgroundUpdateInProgress?: boolean;
}

interface LanguageOption {
  code: string;
  name: string;
}

interface LyricsControlsProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  darkMode: boolean;
  processedLyricsLength: number;
  isTranslating: boolean;
  translationError: string | null;
  selectedLanguages: string[];
  isLanguageMenuOpen: boolean;
  backgroundUpdatesInProgress: Set<string>;
  availableLanguages: LanguageOption[];
  translatedLyrics: { [language: string]: TranslatedLyrics };
  translateLyrics: (targetLanguage: string) => Promise<void>;
  setSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  setIsLanguageMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * LyricsControls component – font slider (HeroUI Slider) and translate button
 * (HeroUI Button + Popover with react-icons globe) on a single row.
 */
export const LyricsControls: React.FC<LyricsControlsProps> = ({
  fontSize,
  onFontSizeChange,
  darkMode,
  processedLyricsLength,
  isTranslating,
  translationError,
  selectedLanguages,
  isLanguageMenuOpen,
  backgroundUpdatesInProgress,
  availableLanguages,
  translatedLyrics,
  translateLyrics,
  setSelectedLanguages,
  setIsLanguageMenuOpen
}) => {
  return (
    <>
      {/* Single-row controls: font slider + translate */}
      <div className={`controls mb-3 flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors duration-300 ${darkMode ? 'bg-gray-800/60' : 'bg-gray-200/60'}`}>
        {/* Font size – HeroUI Slider */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs whitespace-nowrap ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Font</span>
          <Slider
            aria-label="Font size"
            size="sm"
            color="primary"
            step={1}
            minValue={12}
            maxValue={24}
            value={fontSize}
            onChange={(val) => onFontSizeChange(Array.isArray(val) ? val[0] : val)}
            className="w-24"
            classNames={{
              track: 'bg-gray-200 dark:bg-gray-700',
              filler: 'bg-green-500',
              thumb: 'shadow-md border-2 border-green-500 dark:border-green-500',
            }}
          />
          <span className={`text-xs tabular-nums ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{fontSize}px</span>
        </div>

        {/* Translation button – HeroUI Popover */}
        <Popover
          isOpen={isLanguageMenuOpen && !isTranslating}
          onOpenChange={setIsLanguageMenuOpen}
          placement="bottom-start"
          offset={4}
        >
          <PopoverTrigger>
            <Button
              size="sm"
              variant="flat"
              color="primary"
              isDisabled={isTranslating || !processedLyricsLength}
              isLoading={isTranslating}
              startContent={!isTranslating ? <HiGlobeAlt className="h-4 w-4" /> : undefined}
              className="font-medium"
            >
              {isTranslating ? 'Translating…' : 'Translate'}
            </Button>
          </PopoverTrigger>

          <PopoverContent className="p-1 min-w-[180px]">
            <div className="flex flex-col">
              {availableLanguages.map((lang) => (
                <button
                  key={lang.code}
                  className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                    darkMode
                      ? 'hover:bg-gray-700 text-gray-200'
                      : 'hover:bg-gray-100 text-gray-800'
                  }`}
                  onClick={() => {
                    if (selectedLanguages.includes(lang.code)) {
                      setSelectedLanguages(prev => prev.filter(l => l !== lang.code));
                    } else if (translatedLyrics[lang.code]) {
                      setSelectedLanguages(prev => [...prev, lang.code]);
                    } else {
                      translateLyrics(lang.code);
                    }
                  }}
                >
                  <span>{lang.name}</span>
                  <span className="flex items-center gap-1">
                    {backgroundUpdatesInProgress.has(lang.code) && (
                      <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {selectedLanguages.includes(lang.code) && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Translation error */}
      {translationError && (
        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded-md text-sm">
          <p className="font-medium">Translation Error</p>
          <p>{translationError}</p>
        </div>
      )}
    </>
  );
};

export default LyricsControls;
