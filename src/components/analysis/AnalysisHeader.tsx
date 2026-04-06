'use client';

import React from 'react';
import { HiPencil, HiCheck, HiXMark } from 'react-icons/hi2';
import AppTooltip from '@/components/common/AppTooltip';

interface AnalysisHeaderProps {
  videoTitle: string;
  isEditMode: boolean;
  editedTitle: string;
  onTitleChange: (title: string) => void;
  onEditToggle: () => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  showCorrectedChords: boolean;
  hasCorrections: boolean;
  toggleEnharmonicCorrection: () => void;
  isTranscribingLyrics: boolean;
  hasCachedLyrics: boolean;
  canTranscribe: boolean;
  transcribeLyricsWithAI: () => void;
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
  lyricsError,
}) => {
  const enharmonicTooltip = showCorrectedChords
    ? 'Show original chord spellings'
    : 'Show corrected enharmonic spellings';

  const transcribeTooltip = !canTranscribe
    ? 'Add your Music.AI API key in Settings to enable lyrics transcription'
    : isTranscribingLyrics
      ? 'Transcription in progress...'
      : 'AI transcription from audio (word-level sync)';

  return (
    <div className="mb-2 mt-0 rounded-2xl border border-default-200/80 bg-default-100/50 px-3 py-1.5 shadow-sm transition-colors duration-300 dark:border-white/10 dark:bg-gray-800/30 dark:backdrop-blur-md sm:px-4 sm:py-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 w-full md:w-auto sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">
              Analysis Results
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {isEditMode ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="flex-1 rounded-lg border border-default-300 bg-background px-2 py-1 text-sm text-gray-800 dark:border-white/10 dark:bg-gray-800/50 dark:text-gray-100"
                    placeholder="Enter song title..."
                    autoFocus
                  />
                  <AppTooltip content="Save title">
                    <button
                      onClick={onTitleSave}
                      className="p-1 text-green-600 hover:text-green-700 transition-colors"
                      aria-label="Save title"
                    >
                      <HiCheck className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Cancel edit">
                    <button
                      onClick={onTitleCancel}
                      className="p-1 text-red-600 hover:text-red-700 transition-colors"
                      aria-label="Cancel edit"
                    >
                      <HiXMark className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 truncate flex-1">
                    {videoTitle}
                  </p>
                  <AppTooltip content="Edit song title and chords">
                    <button
                      onClick={onEditToggle}
                      className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                      aria-label="Edit song title and chords"
                    >
                      <HiPencil className="w-4 h-4" />
                    </button>
                  </AppTooltip>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0 md:hidden">
            {hasCorrections && (
              <AppTooltip content={enharmonicTooltip}>
                <button
                  onClick={toggleEnharmonicCorrection}
                  className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg border font-medium transition-colors duration-200 whitespace-nowrap ${
                    showCorrectedChords
                      ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                      : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                  }`}
                >
                  {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
                </button>
              </AppTooltip>
            )}

            <AppTooltip content={transcribeTooltip}>
              <span className="inline-flex">
                <button
                  onClick={transcribeLyricsWithAI}
                  disabled={isTranscribingLyrics || !canTranscribe}
                  className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${
                    canTranscribe
                      ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                      : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  }`}
                >
                  {isTranscribingLyrics
                    ? 'Transcribing...'
                    : !canTranscribe
                      ? 'API Key Required'
                      : (hasCachedLyrics ? 'Re-transcribe' : 'Lyrics Transcribe')}
                </button>
              </span>
            </AppTooltip>
          </div>
        </div>

        <div className="hidden md:flex gap-2 flex-shrink-0">
          {hasCorrections && (
            <AppTooltip content={enharmonicTooltip}>
              <button
                onClick={toggleEnharmonicCorrection}
                className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors duration-200 whitespace-nowrap ${
                  showCorrectedChords
                    ? 'bg-blue-100 dark:bg-blue-200 border-blue-300 dark:border-blue-400 text-blue-800 dark:text-blue-900 hover:bg-blue-200 dark:hover:bg-blue-300'
                    : 'bg-gray-50 dark:bg-gray-200 border-gray-200 dark:border-gray-300 text-gray-600 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-300'
                }`}
              >
                {showCorrectedChords ? 'Show Original' : 'Fix Enharmonics'}
              </button>
            </AppTooltip>
          )}

          <AppTooltip content={transcribeTooltip}>
            <span className="inline-flex">
              <button
                onClick={transcribeLyricsWithAI}
                disabled={isTranscribingLyrics || !canTranscribe}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
                  canTranscribe
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                }`}
              >
                {isTranscribingLyrics
                  ? 'Transcribing...'
                  : !canTranscribe
                    ? 'API Key Required'
                    : (hasCachedLyrics ? 'Re-transcribe' : 'Lyrics Transcribe')}
              </button>
            </span>
          </AppTooltip>
        </div>
      </div>

      {lyricsError && (
        <div
          className={`mt-2 ${
            lyricsError.includes('Transcribing lyrics')
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-red-500'
          }`}
        >
          {lyricsError}
        </div>
      )}
    </div>
  );
};

export default AnalysisHeader;
export { AnalysisHeader };