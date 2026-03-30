/**
 * Firebase Storage Service - Simplified Video ID-Based Storage
 *
 * The deprecated Firestore `audioFiles` collection is no longer used.
 * This helper now keeps short-lived in-memory metadata and falls back to
 * Firebase Storage as the active source of truth for cached audio.
 */

import { audioMetadataCache } from '@/services/cache/smartFirebaseCache';
import { storageMonitoringService } from '@/services/storage/storageMonitoringService';
import { findExistingAudioFile, findExistingAudioFiles } from '@/services/firebase/firebaseStorageService';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';

export interface SimplifiedAudioData extends Record<string, unknown> {
  videoId: string;
  audioUrl: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: number;
  fileSize?: number;
  isStreamUrl: boolean;
  streamExpiresAt?: number;
  createdAt: unknown;
  extractionService?: string;
  extractionTimestamp?: number;
  videoDuration?: string;
  videoDescription?: string;
  videoPublishedAt?: string;
  videoViewCount?: number;
}

type SaveAudioMetadataInput = {
  videoId: string;
  audioUrl: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: number;
  fileSize?: number;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
  extractionService?: string;
  extractionTimestamp?: number;
  videoDuration?: string;
  videoDescription?: string;
  videoPublishedAt?: string;
  videoViewCount?: number;
};

function toSimplifiedAudioData(data: SaveAudioMetadataInput): SimplifiedAudioData {
  const isStreamUrl = data.isStreamUrl !== undefined
    ? data.isStreamUrl
    : (data.audioUrl.includes('quicktube.app') || data.audioUrl.includes('lukavukanovic.xyz'));

  return {
    videoId: data.videoId,
    audioUrl: data.audioUrl,
    title: data.title,
    thumbnail: normalizeThumbnailUrl(data.videoId, data.thumbnail, 'mqdefault'),
    channelTitle: data.channelTitle,
    duration: data.duration || 0,
    fileSize: data.fileSize || 0,
    isStreamUrl,
    streamExpiresAt: isStreamUrl ? data.streamExpiresAt : undefined,
    extractionService: data.extractionService,
    extractionTimestamp: data.extractionTimestamp || Date.now(),
    videoDuration: data.videoDuration,
    videoDescription: data.videoDescription,
    videoPublishedAt: data.videoPublishedAt,
    videoViewCount: data.videoViewCount,
    createdAt: Date.now(),
  };
}

function fromStorageResult(videoId: string, result: { audioUrl: string; fileSize?: number }): SimplifiedAudioData {
  return {
    videoId,
    audioUrl: result.audioUrl,
    title: `YouTube Video ${videoId}`,
    thumbnail: normalizeThumbnailUrl(videoId, null, 'mqdefault'),
    duration: 0,
    fileSize: result.fileSize || 0,
    isStreamUrl: false,
    extractionTimestamp: Date.now(),
    createdAt: Date.now(),
  };
}

export class FirebaseStorageSimplified {
  private static instance: FirebaseStorageSimplified;

  public static getInstance(): FirebaseStorageSimplified {
    if (!FirebaseStorageSimplified.instance) {
      FirebaseStorageSimplified.instance = new FirebaseStorageSimplified();
    }
    return FirebaseStorageSimplified.instance;
  }

  async saveAudioMetadata(data: SaveAudioMetadataInput): Promise<boolean> {
    audioMetadataCache.set(`audio_${data.videoId}`, toSimplifiedAudioData(data), true);
    return true;
  }

  async saveAudioMetadataBackground(data: SaveAudioMetadataInput): Promise<void> {
    setTimeout(() => {
      void this.saveAudioMetadata(data);
    }, 0);
  }

  async getCachedAudioMetadata(videoId: string): Promise<SimplifiedAudioData | null> {
    const result = await audioMetadataCache.get(
      `audio_${videoId}`,
      async () => {
        const existingFile = await findExistingAudioFile(videoId);
        if (!existingFile) {
          return null;
        }

        return fromStorageResult(videoId, existingFile);
      },
      (data: Record<string, unknown>) => Boolean(data.audioUrl && data.title)
    );

    if (result) {
      try {
        storageMonitoringService.logStorageOperation({
          type: 'cache_hit',
          videoId,
          fileSize: typeof result.fileSize === 'number' ? result.fileSize : undefined,
          success: true,
        });
      } catch {}
    }

    return result as SimplifiedAudioData | null;
  }

  async isAudioCached(videoId: string): Promise<boolean> {
    const cached = await this.getCachedAudioMetadata(videoId);
    return cached !== null;
  }

  async getMultipleCachedAudio(videoIds: string[]): Promise<Map<string, SimplifiedAudioData>> {
    const results = new Map<string, SimplifiedAudioData>();
    if (videoIds.length === 0) {
      return results;
    }

    const uncachedIds: string[] = [];
    for (const videoId of videoIds) {
      const cached = audioMetadataCache.peek(`audio_${videoId}`);
      if (cached && typeof cached === 'object') {
        results.set(videoId, cached as SimplifiedAudioData);
      } else {
        uncachedIds.push(videoId);
      }
    }

    if (uncachedIds.length === 0) {
      return results;
    }

    const storageResults = await findExistingAudioFiles(uncachedIds);
    for (const [videoId, value] of storageResults.entries()) {
      const normalized = fromStorageResult(videoId, value);
      audioMetadataCache.set(`audio_${videoId}`, normalized, true);
      results.set(videoId, normalized);
    }

    return results;
  }

  async updateAudioMetadata(videoId: string, updates: Partial<SimplifiedAudioData>): Promise<boolean> {
    const cached = audioMetadataCache.peek(`audio_${videoId}`);
    if (!cached || typeof cached !== 'object') {
      return false;
    }

    audioMetadataCache.set(
      `audio_${videoId}`,
      {
        ...(cached as SimplifiedAudioData),
        ...updates,
        videoId,
      },
      true
    );
    return true;
  }

  async deleteCachedAudio(videoId: string): Promise<boolean> {
    audioMetadataCache.invalidate(`audio_${videoId}`);
    return true;
  }

  async getCacheStats(): Promise<{
    totalCached: number;
    validCached: number;
    expiredCached: number;
  }> {
    const stats = audioMetadataCache.getStats();
    return {
      totalCached: stats.totalEntries,
      validCached: stats.totalEntries - stats.incompleteEntries,
      expiredCached: stats.incompleteEntries,
    };
  }
}

export const firebaseStorageSimplified = FirebaseStorageSimplified.getInstance();
