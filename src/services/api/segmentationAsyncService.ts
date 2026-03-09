import axios from 'axios';

import { apiKeyStorage } from '@/services/cache/apiKeyStorageService';
import { BeatInfo } from '@/services/audio/beatDetectionService';
import { SegmentationRequest, SegmentationResult, SongContext } from '@/types/chatbotTypes';

type SegmentationJobState = 'created' | 'processing' | 'completed' | 'failed' | 'not_found';

interface SegmentationJobCreateResponse {
  success: boolean;
  jobId: string;
  status: SegmentationJobState;
  updateToken?: string;
  cached?: boolean;
  reused?: boolean;
  data?: SegmentationResult;
  error?: string;
  workerRequest?: {
    endpointUrl: string;
    audioUrl: string;
    callbackUrl: string;
  };
}

interface SegmentationJobStatusResponse {
  success: boolean;
  jobId: string;
  status: SegmentationJobState;
  data?: SegmentationResult;
  error?: string;
}

export interface SegmentationPollingStrategy {
  initialDelayMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
}

const LONG_SONG_DURATION_SECONDS = 4 * 60;
const VERY_LONG_SONG_DURATION_SECONDS = 5 * 60;
const LONG_SONG_MIN_INITIAL_DELAY_MS = 5 * 60 * 1000;
const LONG_SONG_MAX_INITIAL_DELAY_MS = 6 * 60 * 1000;

function getLastBeatTime(beats?: BeatInfo[]): number | null {
  if (!beats || beats.length === 0) return null;
  const lastBeatTime = beats.reduce((latest, beat) => (
    Number.isFinite(beat.time) ? Math.max(latest, beat.time) : latest
  ), 0);
  return lastBeatTime > 0 ? lastBeatTime : null;
}

export function estimateSegmentationDurationSeconds(songContext: Partial<SongContext>): number | null {
  const candidates = [
    songContext.duration,
    getLastBeatTime(songContext.beats),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

export function getSegmentationPollingStrategy(
  songContext: Partial<SongContext>,
  options: { reused?: boolean } = {},
): SegmentationPollingStrategy {
  const durationSeconds = estimateSegmentationDurationSeconds(songContext);

  if (options.reused) {
    if (durationSeconds !== null && durationSeconds >= LONG_SONG_DURATION_SECONDS) {
      return { initialDelayMs: 15_000, pollIntervalMs: 15_000, maxPollAttempts: 48 };
    }
    if (durationSeconds !== null && durationSeconds >= 2 * 60) {
      return { initialDelayMs: 10_000, pollIntervalMs: 10_000, maxPollAttempts: 60 };
    }
    return { initialDelayMs: 5_000, pollIntervalMs: 5_000, maxPollAttempts: 90 };
  }

  if (durationSeconds !== null && durationSeconds >= LONG_SONG_DURATION_SECONDS) {
    const scaledInitialDelayMs = Math.round(durationSeconds * 1_200);
    const initialDelayMs = durationSeconds >= VERY_LONG_SONG_DURATION_SECONDS
      ? Math.min(Math.max(scaledInitialDelayMs, LONG_SONG_MIN_INITIAL_DELAY_MS), LONG_SONG_MAX_INITIAL_DELAY_MS)
      : Math.max(scaledInitialDelayMs, LONG_SONG_MIN_INITIAL_DELAY_MS);

    return { initialDelayMs, pollIntervalMs: 15_000, maxPollAttempts: 40 };
  }

  if (durationSeconds !== null && durationSeconds >= 3 * 60) {
    return { initialDelayMs: 2 * 60 * 1000, pollIntervalMs: 10_000, maxPollAttempts: 54 };
  }

  if (durationSeconds !== null && durationSeconds >= 60) {
    return { initialDelayMs: 30_000, pollIntervalMs: 7_500, maxPollAttempts: 80 };
  }

  return { initialDelayMs: 5_000, pollIntervalMs: 5_000, maxPollAttempts: 120 };
}

export class SegmentationAsyncService {
  private static instance: SegmentationAsyncService;
  private readonly baseUrl: string;
  private readonly backendTimeoutMs = 10 * 60 * 1000;

  constructor() {
    this.baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  public static getInstance(): SegmentationAsyncService {
    if (!SegmentationAsyncService.instance) {
      SegmentationAsyncService.instance = new SegmentationAsyncService();
    }

    return SegmentationAsyncService.instance;
  }

  async requestSegmentation(songContext: SongContext): Promise<SegmentationResult> {
    const accessCode = await apiKeyStorage.getApiKey('songformerAccess');
    const request: SegmentationRequest = {
      songContext,
      ...(accessCode ? { accessCode } : {}),
    };
    const createResponse = await axios.post<SegmentationJobCreateResponse>(
      `${this.baseUrl}/api/segmentation/jobs`,
      request,
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const createPayload = createResponse.data;
    if (!createPayload.success) {
      throw new Error(createPayload.error || 'Failed to create segmentation job');
    }

    if (createPayload.status === 'completed' && createPayload.data) {
      return createPayload.data;
    }

    if (createPayload.jobId && createPayload.reused && (createPayload.status === 'created' || createPayload.status === 'processing')) {
      return this.pollJobCompletion(createPayload.jobId, songContext, { reused: true });
    }

    if (!createPayload.jobId || !createPayload.updateToken || !createPayload.workerRequest) {
      throw new Error('Segmentation job was created without worker metadata');
    }

    void this.runBrowserWorker(
      createPayload.jobId,
      createPayload.updateToken,
      createPayload.workerRequest.endpointUrl,
      createPayload.workerRequest.audioUrl,
      createPayload.workerRequest.callbackUrl,
      songContext,
    );

    return this.pollJobCompletion(createPayload.jobId, songContext);
  }

  private async pollJobCompletion(
    jobId: string,
    songContext: Partial<SongContext>,
    options: { reused?: boolean } = {},
  ): Promise<SegmentationResult> {
    const strategy = getSegmentationPollingStrategy(songContext, options);

    for (let attempt = 0; attempt < strategy.maxPollAttempts; attempt++) {
      const waitMs = attempt === 0 ? strategy.initialDelayMs : strategy.pollIntervalMs;
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      const response = await axios.get<SegmentationJobStatusResponse>(`${this.baseUrl}/api/segmentation/jobs/${jobId}`, {
        timeout: 15000,
      });

      const payload = response.data;
      if (!payload.success) {
        throw new Error(payload.error || 'Failed to get segmentation job status');
      }

      if (payload.status === 'completed' && payload.data) {
        return payload.data;
      }

      if (payload.status === 'failed') {
        throw new Error(payload.error || 'Segmentation job failed');
      }
    }

    throw new Error('Segmentation job did not complete in time');
  }

  private async runBrowserWorker(
    jobId: string,
    updateToken: string,
    endpointUrl: string,
    audioUrl: string,
    callbackUrl: string,
    songContext: SongContext,
  ): Promise<void> {
    try {
      const directResponse = await axios.post(
        endpointUrl,
        {
          audioUrl,
          asyncJob: {
            jobId,
            updateToken,
            callbackUrl,
            songContext,
          },
        },
        {
          timeout: this.backendTimeoutMs,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const directPayload = directResponse.data;
      if (!directPayload?.success) {
        throw new Error(directPayload?.error || 'SongFormer backend request failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SongFormer segmentation failed';
      await this.patchJob(jobId, updateToken, {
        status: 'failed',
        error: message,
      });
    }
  }

  private async patchJob(
    jobId: string,
    updateToken: string,
    payload: {
      status: 'processing' | 'completed' | 'failed';
      error?: string;
      data?: SegmentationResult;
      model?: string;
    },
  ): Promise<void> {
    await axios.patch(
      `${this.baseUrl}/api/segmentation/jobs/${jobId}`,
      {
        updateToken,
        ...payload,
      },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

export const segmentationAsyncService = SegmentationAsyncService.getInstance();