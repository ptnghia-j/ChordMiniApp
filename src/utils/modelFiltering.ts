/**
 * Model Filtering Utility for ChordMiniApp
 * 
 * Provides environment-based filtering for experimental local-only models.
 * BTC models (btc-sl, btc-pl) and Beat Transformer are development-only features that require
 * local repository cloning and are not available in production deployments.
 */

export type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';
export type BeatDetectorType = 'madmom' | 'beat-transformer';

/**
 * Check if BTC models should be available based on environment
 * @returns true if BTC models should be shown (local development), false if hidden (production)
 */
export function areExperimentalModelsAvailable(): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return false;
  }

  const origin = window.location.origin;
  const isLocalDevelopment = origin.includes('localhost') || origin.includes('127.0.0.1');

  return isLocalDevelopment;
}

export function areBTCModelsAvailable(): boolean {
  return areExperimentalModelsAvailable();
}

export function areBeatTransformerAvailable(): boolean {
  return areExperimentalModelsAvailable();
}

/**
 * Filter chord detector types based on environment
 * @param models Array of chord detector types to filter
 * @returns Filtered array with BTC models removed in production
 */
export function filterChordModels(models: ChordDetectorType[]): ChordDetectorType[] {
  if (areBTCModelsAvailable()) {
    // Local development: show all models
    return models;
  }

  // Production: filter out BTC models
  return models.filter(model => !model.startsWith('btc-'));
}

/**
 * Get available chord detector types based on environment
 * @returns Array of available chord detector types
 */
export function getAvailableChordModels(): ChordDetectorType[] {
  const allModels: ChordDetectorType[] = ['chord-cnn-lstm', 'btc-sl', 'btc-pl'];
  return filterChordModels(allModels);
}

export function filterBeatModels(models: BeatDetectorType[]): BeatDetectorType[] {
  if (areBeatTransformerAvailable()) {
    return models;
  }

  return models.filter((model) => model !== 'beat-transformer');
}

export function getAvailableBeatModels(): BeatDetectorType[] {
  const allModels: BeatDetectorType[] = ['madmom', 'beat-transformer'];
  return filterBeatModels(allModels);
}

/**
 * Check if a specific chord model is available in the current environment
 * @param model The chord detector type to check
 * @returns true if the model is available, false otherwise
 */
export function isChordModelAvailable(model: ChordDetectorType): boolean {
  const availableModels = getAvailableChordModels();
  return availableModels.includes(model);
}

export function isBeatModelAvailable(model: BeatDetectorType): boolean {
  const availableModels = getAvailableBeatModels();
  return availableModels.includes(model);
}

/**
 * Get a safe fallback chord model if the requested model is not available
 * @param requestedModel The requested chord detector type
 * @returns A safe chord detector type that's available in the current environment
 */
export function getSafeChordModel(requestedModel: ChordDetectorType): ChordDetectorType {
  if (isChordModelAvailable(requestedModel)) {
    return requestedModel;
  }

  // Fallback to chord-cnn-lstm (always available)
  return 'chord-cnn-lstm';
}

export function getSafeBeatModel(requestedModel: BeatDetectorType): BeatDetectorType {
  if (isBeatModelAvailable(requestedModel)) {
    return requestedModel;
  }

  return 'madmom';
}

/**
 * Get the appropriate API endpoint for chord recognition based on model
 * @param model The chord detector type
 * @returns The API endpoint path
 */
export function getChordRecognitionEndpoint(model: ChordDetectorType): string {
  // Ensure the model is available in the current environment
  const safeModel = getSafeChordModel(model);
  
  switch (safeModel) {
    case 'btc-sl':
      return '/api/recognize-chords-btc-sl';
    case 'btc-pl':
      return '/api/recognize-chords-btc-pl';
    case 'chord-cnn-lstm':
    default:
      return '/api/recognize-chords';
  }
}

/**
 * Check if we're in a development environment (for UI indicators)
 * @returns true if in development, false if in production
 */
export function isDevelopmentEnvironment(): boolean {
  return areExperimentalModelsAvailable();
}

/**
 * Get environment-specific model descriptions
 * @param model The chord detector type
 * @returns Description with environment-specific notes
 */
export function getModelDescription(model: ChordDetectorType): string {
  const baseDescriptions = {
    'chord-cnn-lstm': 'CNN+LSTM model with 301 chord labels for comprehensive chord recognition',
    'btc-sl': 'Transformer model with 170 chord labels, supervised learning approach',
    'btc-pl': 'Transformer model with 170 chord labels, pre-training + fine-tuning approach'
  };

  const description = baseDescriptions[model];
  
  // Add development-only note for BTC models in development environment
  if (model.startsWith('btc-') && isDevelopmentEnvironment()) {
    return `${description} (Development only - requires local repository)`;
  }

  return description;
}

export function getBeatModelDescription(model: BeatDetectorType): string {
  const baseDescriptions = {
    madmom: 'Neural network with high accuracy and speed, best for common time signatures',
    'beat-transformer': 'DL model with 5-channel audio separation, flexible in time signatures, slow processing speed',
  };

  const description = baseDescriptions[model];

  if (model === 'beat-transformer' && isDevelopmentEnvironment()) {
    return `${description} (Development only - requires local repository)`;
  }

  return description;
}
