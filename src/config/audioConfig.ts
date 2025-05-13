/**
 * Audio Processing Configuration
 * 
 * This file contains settings and constants for audio processing.
 */

export const AUDIO_PROCESSING_CONFIG = {
  // General settings
  sampleRate: 44100, // Sample rate in Hz
  
  // Chord recognition settings
  chordRecognition: {
    windowSize: 4096, // FFT window size
    hopSize: 2048, // Hop size between windows (50% overlap)
    minFrequency: 60, // Minimum frequency to analyze (Hz)
    maxFrequency: 1000, // Maximum frequency to analyze (Hz)
  },
  
  // Beat detection settings
  beatDetection: {
    windowSize: 1024,
    hopSize: 512,
    threshold: 0.3, // Onset detection threshold
    minTempo: 60, // Minimum tempo to detect (BPM)
    maxTempo: 200, // Maximum tempo to detect (BPM)
  },
  
  // Audio extraction settings
  extraction: {
    quality: 'highestaudio', // Quality of audio to extract from YouTube
    format: 'mp3', // Format to save audio in
    bitrate: '128k', // Bitrate for audio encoding
  }
};

// List of supported chord types for recognition
export const SUPPORTED_CHORD_TYPES = [
  'maj', // Major
  'min', // Minor
  '7', // Dominant 7th
  'maj7', // Major 7th
  'min7', // Minor 7th
  'dim', // Diminished
  'dim7', // Diminished 7th
  'aug', // Augmented
  'sus2', // Suspended 2nd
  'sus4', // Suspended 4th
];

// Notes in Western music (C through B)
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Default parameters for audio analysis
export const DEFAULT_ANALYSIS_PARAMS = {
  chordSensitivity: 0.7, // How sensitive the chord detection is (0-1)
  beatSensitivity: 0.5, // How sensitive the beat detection is (0-1)
  useChromaticPitchDetection: true, // Whether to use chromatic pitch detection 
  minimumChordDuration: 0.1, // Minimum duration of a chord in seconds
}; 