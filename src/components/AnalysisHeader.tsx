'use client';

import React from 'react';
import { HiPencil, HiCheck, HiXMark } from 'react-icons/hi2';
import SegmentationToggleButton from '@/components/SegmentationToggleButton';
import { useShowSegmentation, useToggleSegmentation } from '@/stores/uiStore';

interface AnalysisHeaderProps {
  // Title and editing
  videoTitle: string;
  isEditMode: boolean;
  editedTitle: string;
  onTitleChange: (title: string) => void;
  onEditToggle: () => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;

  // Correction toggle
  showCorrectedChords: boolean;
  hasCorrections: boolean;
  toggleEnharmonicCorrection: () => void;
  
  // Lyrics transcription
  isTranscribingLyrics: boolean;
  hasCachedLyrics: boolean;
  canTranscribe: boolean;
  transcribeLyricsWithAI: () => void;
  
  // Segmentation
  hasSegmentationData: boolean;

  // Error display
  lyricsError: string | null;
}

const AnalysisHeader: React.FC<AnalysisHeaderProps> = ({
  videoTitle,
  isEditMode,
  editedTitle,
  onTitleChange,
  onEditToggle,
  onTitleSave,
  onTitleCancel,
  showCorrectedChords,
  hasCorrections,
  toggleEnharmonicCorrection,
  isTranscribingLyrics,
  hasCachedLyrics,
  canTranscribe,
  transcribeLyricsWithAI,
  hasSegmentationData,
  lyricsError
}) => {
  const showSegmentation = useShowSegmentation();
  const toggleSegmentation = useToggleSegmentation();
  return (
    <div className="rounded-lg bg-white dark:bg-dark-bg mb-2 mt-0 transition-colors duration-300">
      {/* Mobile: buttons next to title, Desktop: buttons on right side */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-2 gap-2">
        {/* Title section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full md:w-auto gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">Analysis Results</h3>
            <div className="flex items-center gap-2 mt-1">
              {isEditMode ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-800 dark:text-gray-100"
                    placeholder="Enter song title..."
                    autoFocus
                  />
                  <button
                    onClick={onTitleSave}
                    className="p-1 text-green-600 hover:text-green-700 transition-colors"
                    title="Save title"
                  >
                    <HiCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onTitleCancel}
                    className="p-1 text-red-600 hover:text-red-700 transition-colors"
                    title="Cancel edit"
                  >
                    <HiXMark className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 truncate flex-1">
                    {videoTitle}
                  </p>
                  <button
                    onClick={onEditToggle}
                    className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                    title="Edit song title and chords"
                  >
                    <HiPencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Buttons row - next to title on mobile, separate on desktop */}
          <div className="flex gap-2 flex-shrink-0 md:hidden">
            {/* Enharmonic correction toggle button - show for both legacy and sequence corrections */}
            {hasCorrections && (
              <button
                onClick={toggleEnharmonicCorrection}
                className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg border font-medium transition-colors duration-200 whitespace-nowrap ${
                  showCorrectedChords
                    ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                    : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                }`}
                title={showCorrectedChords ? 'Show original chord spellings' : 'Show corrected enharmonic spellings'}
              >
                {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
              </button>
            )}

            {/* Music.AI Transcription Button */}
            <button
              onClick={transcribeLyricsWithAI}
              disabled={isTranscribingLyrics || !canTranscribe}
              className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${
                canTranscribe
                  ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
              }`}
              title={
                !canTranscribe
                  ? "Add your Music.AI API key in Settings to enable lyrics transcription"
                  : isTranscribingLyrics
                  ? "Transcription in progress..."
                  : "AI transcription from audio (word-level sync)"
              }
            >
              {isTranscribingLyrics
                ? "Transcribing..."
                : !canTranscribe
                ? "API Key Required"
                : (hasCachedLyrics ? "Re-transcribe" : "Lyrics Transcribe")
              }
            </button>

            {/* Segmentation Toggle Button */}
            <SegmentationToggleButton
              isEnabled={showSegmentation}
              onClick={toggleSegmentation}
              hasSegmentationData={hasSegmentationData}
            />
          </div>
        </div>

        {/* Desktop buttons - separate section on right side */}
        <div className="hidden md:flex gap-2 flex-shrink-0">
          {/* Enharmonic correction toggle button - show for both legacy and sequence corrections */}
          {hasCorrections && (
            <button
              onClick={toggleEnharmonicCorrection}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors duration-200 whitespace-nowrap ${
                showCorrectedChords
                  ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                  : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
              }`}
              title={showCorrectedChords ? 'Show original chord spellings' : 'Show corrected enharmonic spellings'}
            >
              {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
            </button>
          )}

          {/* Music.AI Transcription Button */}
          <button
            onClick={transcribeLyricsWithAI}
            disabled={isTranscribingLyrics || !canTranscribe}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
              canTranscribe
                ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
            title={
              !canTranscribe
                ? "Add your Music.AI API key in Settings to enable lyrics transcription"
                : isTranscribingLyrics
                ? "Transcription in progress..."
                : "AI transcription from audio (word-level sync)"
            }
          >
            {isTranscribingLyrics
              ? "Transcribing..."
              : !canTranscribe
              ? "API Key Required"
              : (hasCachedLyrics ? "Re-transcribe" : "Lyrics Transcribe")
            }
          </button>

          {/* Segmentation Toggle Button */}
          <SegmentationToggleButton
            isEnabled={showSegmentation}
            onClick={toggleSegmentation}
            hasSegmentationData={hasSegmentationData}
          />
        </div>
      </div>

      {lyricsError && (
        <div className={`mt-2 md:col-span-2 ${
          lyricsError.includes('Transcribing lyrics')
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-red-500'
        }`}>
          {lyricsError}
        </div>
      )}
    </div>
  );
};

export default AnalysisHeader;
export { AnalysisHeader };
