import React from 'react';

// Types
interface ChordData {
  time: number;
  chord: string;
}

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
  chords: ChordData[];
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

// Globe icon component
const GlobeIcon: React.FC<{ className?: string; darkMode?: boolean }> = ({ className = "h-5 w-5" }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9m0 9c-5 0-9-4-9-9s4-9 9-9"
    />
  </svg>
);

/**
 * LyricsControls component - extracted from LeadSheetDisplay
 * Handles font size slider and translation dropdown controls
 */
export const LyricsControls: React.FC<LyricsControlsProps> = ({
  fontSize,
  onFontSizeChange,
  darkMode,
  chords,
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
      {/* Controls in a single line */}
      <div className={`controls mb-3 flex items-center justify-between p-2 rounded-lg transition-colors duration-300 ${darkMode ? 'bg-gray-800/60' : 'bg-gray-200/60'}`}>
        <div className="flex items-center space-x-3">
          {/* Font size control - YouTube-style slider with blue theme */}
          <div className="flex items-center">
            <span className={`text-sm mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Font:</span>
            <div className={`w-24 relative h-2 rounded-full overflow-hidden mr-1 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
              <div
                className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
                style={{ width: `${((fontSize - 12) / 12) * 100}%` }}
              ></div>
              <input
                id="font-size"
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{fontSize}px</span>
          </div>

          {/* Translation dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
              disabled={isTranslating || !processedLyricsLength}
              className={`px-3 py-1 rounded text-sm font-medium flex items-center ${
                isTranslating
                  ? `cursor-not-allowed ${darkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'}`
                  : `${darkMode ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} text-white`
              }`}
            >
              {isTranslating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Translating...
                </span>
              ) : (
                <>
                  <GlobeIcon className="mr-2 h-4 w-4" darkMode={darkMode} />
                  Translate
                  <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </>
              )}
            </button>

            {/* Language selection dropdown */}
            {isLanguageMenuOpen && !isTranslating && (
              <div className="absolute z-10 mt-1 w-48 bg-white dark:bg-content-bg rounded-md shadow-lg py-1 text-sm">
                {availableLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer"
                    onClick={() => {
                      // Toggle language selection
                      if (selectedLanguages.includes(lang.code)) {
                        setSelectedLanguages(prev => prev.filter(l => l !== lang.code));
                      } else if (translatedLyrics[lang.code]) {
                        // If we already have a translation, just add it to selected
                        setSelectedLanguages(prev => [...prev, lang.code]);
                      } else {
                        // Otherwise translate it first
                        translateLyrics(lang.code);
                      }
                    }}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>{lang.name}</span>
                      <div className="flex items-center space-x-1">
                        {/* Show background update indicator */}
                        {backgroundUpdatesInProgress.has(lang.code) && (
                          <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {selectedLanguages.includes(lang.code) && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Display chord count if available */}
        {chords && chords.length > 0 && (
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <span className="font-medium">{chords.length}</span> chords integrated
          </div>
        )}
      </div>

      {/* Translation error message */}
      {translationError && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-md text-sm">
          <p className="font-medium">Translation Error</p>
          <p>{translationError}</p>
        </div>
      )}
    </>
  );
};

export default LyricsControls;
