/**
 * Translation Service with Cache-First Approach
 *
 * This service implements a cache-first strategy with background updates:
 * 1. Immediately return cached translations if available
 * 2. Simultaneously trigger background API calls for fresh translations
 * 3. Update cache and notify UI when fresh translations complete
 */

import axios from 'axios';

export interface TranslationResponse {
  originalLyrics: string;
  translatedLyrics: string;
  sourceLanguage: string;
  targetLanguage: string;
  detectedLanguage?: string;
  fromCache?: boolean;
  backgroundUpdateInProgress?: boolean;
  timestamp?: number;
}

export interface TranslationRequest {
  lyrics: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  videoId?: string;
  geminiApiKey?: string; // Optional user-provided Gemini API key (BYOK)
}

export interface TranslationUpdateCallback {
  (translation: TranslationResponse): void;
}

/**
 * Translation service class that manages cache-first translations with background updates
 */
export class TranslationService {
  private updateCallbacks: Map<string, TranslationUpdateCallback[]> = new Map();
  private pendingUpdates: Set<string> = new Set();

  /**
   * Translates lyrics with cache-first approach
   * @param request Translation request parameters
   * @param onUpdate Optional callback for background updates
   * @returns Promise resolving to translation response (cached or fresh)
   */
  async translateLyrics(
    request: TranslationRequest,
    onUpdate?: TranslationUpdateCallback
  ): Promise<TranslationResponse> {
    const requestKey = this.generateRequestKey(request);

    // Register update callback if provided
    if (onUpdate) {
      this.registerUpdateCallback(requestKey, onUpdate);
    }

    try {
      console.log('Requesting cache-first translation');

      // Call the cache-first API endpoint
      const response = await axios.post('/api/translate-lyrics-cached', request, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const translationData: TranslationResponse = response.data;

      // If this is cached data with background update in progress, set up polling
      if (translationData.fromCache && translationData.backgroundUpdateInProgress) {
        console.log('Cached translation returned, background update in progress');
        this.setupBackgroundUpdatePolling(requestKey, request);
      }

      return translationData;

    } catch (error) {
      console.error('Error in cache-first translation:', error);

      // Fallback to regular translation API
      console.log('Falling back to regular translation API');
      return this.fallbackTranslation(request);
    }
  }

  /**
   * Registers a callback for translation updates
   */
  private registerUpdateCallback(requestKey: string, callback: TranslationUpdateCallback): void {
    if (!this.updateCallbacks.has(requestKey)) {
      this.updateCallbacks.set(requestKey, []);
    }
    this.updateCallbacks.get(requestKey)!.push(callback);
  }

  /**
   * Notifies all registered callbacks for a request
   */
  private notifyUpdateCallbacks(requestKey: string, translation: TranslationResponse): void {
    const callbacks = this.updateCallbacks.get(requestKey);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(translation);
        } catch (error) {
          console.error('Error in translation update callback:', error);
        }
      });
    }
  }

  /**
   * Sets up polling for background translation updates
   */
  private setupBackgroundUpdatePolling(requestKey: string, request: TranslationRequest): void {
    if (this.pendingUpdates.has(requestKey)) {
      console.log('Background update already in progress for this request');
      return;
    }

    this.pendingUpdates.add(requestKey);
    console.log('Setting up background update polling');

    // Poll for updates with exponential backoff
    let pollAttempts = 0;
    const maxAttempts = 10;
    const baseDelay = 1000; // Start with 1 second

    const pollForUpdate = async () => {
      try {
        pollAttempts++;
        console.log(`Polling for translation update, attempt ${pollAttempts}`);

        // Make another request to check if fresh translation is ready
        const response = await axios.post('/api/translate-lyrics-cached', request, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const updatedTranslation: TranslationResponse = response.data;

        // Check if background update is complete (no longer in progress)
        if (!updatedTranslation.backgroundUpdateInProgress) {
          console.log('Background translation completed, stopping polling');
          this.pendingUpdates.delete(requestKey);

          // Notify all callbacks with the updated translation
          this.notifyUpdateCallbacks(requestKey, {
            ...updatedTranslation,
            fromCache: false,
            backgroundUpdateInProgress: false
          });

          // Clean up callbacks for this request
          this.updateCallbacks.delete(requestKey);
          return;
        }

        // If still in progress and we haven't exceeded max attempts, schedule next poll
        if (pollAttempts < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(1.5, pollAttempts - 1), 10000); // Cap at 10 seconds
          console.log(`Background update still in progress, polling again in ${delay}ms`);
          setTimeout(pollForUpdate, delay);
        } else {
          console.log('Max polling attempts reached, stopping background update polling');
          this.pendingUpdates.delete(requestKey);
          this.updateCallbacks.delete(requestKey);
        }

      } catch (error) {
        console.error('Error polling for translation update:', error);

        // On error, stop polling and clean up
        this.pendingUpdates.delete(requestKey);
        this.updateCallbacks.delete(requestKey);
      }
    };

    // Start polling after a short delay
    setTimeout(pollForUpdate, 2000);
  }

  /**
   * Fallback to regular translation API
   */
  private async fallbackTranslation(request: TranslationRequest): Promise<TranslationResponse> {
    try {
      console.log('Using fallback translation API');

      const response = await axios.post('/api/translate-lyrics', request, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        ...response.data,
        fromCache: false,
        backgroundUpdateInProgress: false
      };

    } catch (error) {
      console.error('Error in fallback translation:', error);
      throw new Error('Translation service is temporarily unavailable');
    }
  }

  /**
   * Generates a unique key for a translation request
   */
  private generateRequestKey(request: TranslationRequest): string {
    const { lyrics, sourceLanguage, targetLanguage, videoId } = request;
    const baseKey = lyrics.substring(0, 50);
    const langKey = `${sourceLanguage || 'auto'}-to-${targetLanguage || 'English'}`;
    const vidKey = videoId ? `-${videoId}` : '';
    return `${baseKey}-${langKey}${vidKey}`;
  }

  /**
   * Cleans up callbacks and pending updates for a specific request
   */
  public cleanup(request: TranslationRequest): void {
    const requestKey = this.generateRequestKey(request);
    this.updateCallbacks.delete(requestKey);
    this.pendingUpdates.delete(requestKey);
  }

  /**
   * Cleans up all callbacks and pending updates
   */
  public cleanupAll(): void {
    this.updateCallbacks.clear();
    this.pendingUpdates.clear();
  }
}

// Export a singleton instance
export const translationService = new TranslationService();

/**
 * Convenience function for one-off translations with cache-first approach
 */
export async function translateLyricsWithCache(
  request: TranslationRequest,
  onUpdate?: TranslationUpdateCallback
): Promise<TranslationResponse> {
  return translationService.translateLyrics(request, onUpdate);
}
