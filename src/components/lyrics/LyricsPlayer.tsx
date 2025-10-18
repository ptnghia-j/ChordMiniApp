import React, { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import { LyricsData, LyricLine } from '@/types/musicAiTypes';
import EnhancedLyricsDisplay from './EnhancedLyricsDisplay';

interface LyricsPlayerProps {
  videoId: string;
  lyrics: LyricsData;
  onTimeUpdate?: (currentTime: number) => void;
  autoScroll?: boolean;
}

/**
 * Component that combines YouTube player with synchronized lyrics display
 */
const LyricsPlayer: React.FC<LyricsPlayerProps> = ({
  videoId,
  lyrics,
  onTimeUpdate,
  autoScroll = true,
}) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  const playerRef = useRef<ReactPlayer>(null);

  // YouTube video URL
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Update current time and find current lyric line
  const handleProgress = (state: { playedSeconds: number }) => {
    try {
      const newTime = state.playedSeconds;
      setCurrentTime(newTime);

      if (onTimeUpdate) {
        onTimeUpdate(newTime);
      }

      // Make sure lyrics.lines exists and is an array
      if (lyrics && lyrics.lines && Array.isArray(lyrics.lines)) {
        // Find the current line based on time
        const newCurrentLine = lyrics.lines.find(
          line => newTime >= (line.startTime || 0) && newTime <= (line.endTime || 0)
        ) || null;

        if (newCurrentLine !== currentLine) {
          setCurrentLine(newCurrentLine);
        }
      }
    } catch (error) {
      console.error('Error in handleProgress:', error);
    }
  };

  // We don't need this effect anymore since we're using EnhancedLyricsDisplay
  // which handles auto-scrolling internally

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handle seeking in the video
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    if (playerRef.current) {
      playerRef.current.seekTo(seekTime, 'seconds');
    }
  };

  // Handle clicking on a lyric line to seek to that time
  const handleLyricClick = (line: LyricLine) => {
    try {
      if (playerRef.current && line && typeof line.startTime === 'number') {
        playerRef.current.seekTo(line.startTime, 'seconds');
      }
    } catch (error) {
      console.error('Error in handleLyricClick:', error);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* YouTube Player */}
      <div className="w-full lg:w-1/2">
        <div className="relative pt-[56.25%]">
          <ReactPlayer
            ref={playerRef}
            url={videoUrl}
            width="100%"
            height="100%"
            style={{ position: 'absolute', top: 0, left: 0 }}
            playing={playing}
            volume={volume}
            muted={muted}
            onProgress={handleProgress}
            onDuration={setDuration}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            controls={true}
          />
        </div>

        {/* Custom Controls */}
        <div className="mt-4 bg-gray-100 p-4 rounded-lg">
          <div className="flex items-center mb-2">
            <button
              onClick={() => setPlaying(!playing)}
              className="bg-blue-600 text-white rounded-full p-2 mr-2"
            >
              {playing ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* YouTube-style progress bar with blue color */}
            <div className="flex-1 mx-2 relative h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
                style={{ width: `${(currentTime / (duration || 100)) * 100}%` }}
              ></div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="text-sm text-gray-600 w-20 text-right">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={() => setMuted(!muted)}
              className="text-gray-600 mr-2"
            >
              {muted ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* YouTube-style volume slider with blue color */}
            <div className="flex-1 mx-2 relative h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
                style={{ width: `${volume * 100}%` }}
              ></div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                disabled={muted}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Lyrics Display */}
      <div className="w-full lg:w-1/2">
        <EnhancedLyricsDisplay
          lyrics={lyrics}
          currentTime={currentTime}
          onLineClick={handleLyricClick}
          autoScroll={autoScroll}
        />
      </div>
    </div>
  );
};

export default LyricsPlayer;
