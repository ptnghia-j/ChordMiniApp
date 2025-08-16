import React from 'react';

// Types
interface TextColors {
  unplayed: string;
  played: string;
  chord: string;
  background: string;
}

interface NoLyricsMessageProps {
  error?: string;
  textColors: TextColors;
}

/**
 * NoLyricsMessage component - extracted from LeadSheetDisplay
 * Handles error state rendering when no lyrics are available
 */
export const NoLyricsMessage: React.FC<NoLyricsMessageProps> = ({
  error,
  textColors
}) => {
  const errorMessage = error || 'No lyrics available for this song';
  const isNoLyricsDetected = errorMessage.includes('No lyrics detected');

  return (
    <div className="lead-sheet-container p-4 rounded-lg shadow" style={{ backgroundColor: textColors.background }}>
      <div className="text-center p-8" style={{ color: textColors.unplayed }}>
        <div className="mb-4 text-xl font-semibold">Lyrics Unavailable</div>
        <div className="text-base">{errorMessage}</div>
        <div className="mt-6 text-sm opacity-75">
          This may be due to:
          <ul className="list-disc list-inside mt-2 text-left max-w-md mx-auto">
            {isNoLyricsDetected && (
              <>
                <li className="font-medium">No lyrics detected in the audio</li>
                <li>The song being instrumental</li>
                <li>Audio quality issues</li>
              </>
            )}
            {!isNoLyricsDetected && (
              <>
                <li>No lyrics detected in the audio</li>
                <li>Music.ai API service unavailable or configuration issues</li>
                <li>The song being instrumental</li>
                <li>Audio quality issues</li>
              </>
            )}
            {errorMessage.includes('API') && (
              <li className="text-red-500">Music.ai API connection issue - please check the console logs</li>
            )}
            {errorMessage.includes('transcribe') && (
              <li className="text-red-500">Transcription service error - please try again later</li>
            )}
            {errorMessage.includes('connection') && (
              <li className="text-red-500">Network connection issue - please check your internet connection</li>
            )}
            {errorMessage.includes('timeout') && (
              <li className="text-red-500">Request timeout - the Music.ai API is taking too long to respond</li>
            )}
            {errorMessage.includes('workflow') && (
              <li className="text-red-500">Workflow not found - the Music.ai API doesn&apos;t have the required workflow</li>
            )}
            {errorMessage.includes('No workflows available') && (
              <li className="text-red-500">No workflows available - please set up workflows in your Music.ai account</li>
            )}
            {errorMessage.includes('not configured') && (
              <li className="text-red-500">The selected workflow is not configured for lyrics transcription - please set up a proper workflow in your Music.ai account</li>
            )}
            {errorMessage.includes('Job failed') && (
              <li className="text-red-500">The Music.ai API job failed - please check your workflow configuration</li>
            )}
            {errorMessage.includes('Unknown error') && (
              <li className="text-red-500">The Music.ai API returned an unknown error - please check your workflow configuration</li>
            )}
          </ul>
        </div>
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-700 font-medium">Troubleshooting:</p>
          <ul className="list-disc list-inside mt-2 text-left max-w-md mx-auto text-blue-600">
            {!isNoLyricsDetected ? (
              <>
                <li>Check that your Music.ai API key is valid and properly configured</li>
                <li>Ensure you have created appropriate workflows in your Music.ai account</li>
                <li>Try with a different audio file or YouTube video</li>
                <li>Check the browser console for detailed error messages</li>
              </>
            ) : (
              <>
                <li>Try with a different song that has vocals</li>
                <li>This may be an instrumental track without lyrics</li>
                <li>The audio quality might be too low for lyrics detection</li>
                <li>The vocals might be too quiet or mixed in a way that makes lyrics detection difficult</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NoLyricsMessage;
