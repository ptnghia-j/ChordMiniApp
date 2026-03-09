import { useState, useCallback, useEffect } from 'react';
import { addToast } from '@heroui/react';
import { requestSongSegmentation } from '@/services/api/chatbotService';
import { SegmentationResult, SongContext } from '@/types/chatbotTypes';
import { useUIStore } from '@/stores/uiStore';

const SEGMENTATION_ACCESS_REQUEST_EMAIL = process.env.NEXT_PUBLIC_SEGMENTATION_ACCESS_REQUEST_EMAIL || 'phantrongnghia510@gmail.com';

function shouldShowSegmentationAccessToast(errorMessage: string): boolean {
  const normalizedMessage = errorMessage.toLowerCase();
  return normalizedMessage.includes('access code') || normalizedMessage.includes('request access via');
}

/**
 * Custom hook to manage segmentation state and handlers
 * Extracted from the main page component to isolate segmentation logic
 */
export const useSegmentationState = () => {
  const [segmentationData, setSegmentationData] = useState<SegmentationResult | null>(null);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentationError, setSegmentationError] = useState<string | null>(null);
  const showSegmentation = useUIStore((state) => state.showSegmentation);
  const setShowSegmentation = useUIStore((state) => state.setShowSegmentation);

  useEffect(() => {
    if (segmentationData && !showSegmentation) {
      console.warn('🎵 Segmentation data exists while showSegmentation=false; restoring visible state');
      setShowSegmentation(true);
    }
  }, [segmentationData, showSegmentation, setShowSegmentation]);

  const applySegmentationResult = useCallback((result: SegmentationResult) => {
    setSegmentationData(result);
    setShowSegmentation(true);
    setSegmentationError(null);
    console.log('🎵 Segmentation result received:', result);
  }, [setShowSegmentation]);

  const runSegmentation = useCallback(async (songContext?: SongContext) => {
    if (!songContext) {
      const error = 'No song context available for segmentation';
      setSegmentationError(error);
      throw new Error(error);
    }

    if (!songContext.beats || songContext.beats.length === 0) {
      const error = 'Beat data is required before running segmentation';
      setSegmentationError(error);
      throw new Error(error);
    }

    const audioUrl = songContext.audioUrl;
    if (!audioUrl || audioUrl.startsWith('blob:')) {
      const error = 'SongFormer requires a backend-accessible audio URL';
      setSegmentationError(error);
      throw new Error(error);
    }

    setIsSegmenting(true);
    setSegmentationError(null);
    try {
      console.log('🎵 Starting SongFormer segmentation request');
      const result = await requestSongSegmentation(songContext);
      applySegmentationResult(result);
      console.log('🎵 SongFormer segmentation applied to UI state');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Song segmentation failed';
      console.error('🎵 SongFormer segmentation failed before UI update:', error);
      setSegmentationError(message);
      if (shouldShowSegmentationAccessToast(message)) {
        addToast({
          title: 'Song segmentation needs an access code',
          description: `This song hasn’t been segmented yet. Add your access code in Settings or request one via ${SEGMENTATION_ACCESS_REQUEST_EMAIL}.`,
          color: 'warning',
        });
      }
      throw error;
    } finally {
      setIsSegmenting(false);
    }
  }, [applySegmentationResult]);

  const toggleSegmentation = useCallback(async (songContext?: SongContext) => {
    if (segmentationData) {
      setShowSegmentation(!showSegmentation);
      return segmentationData;
    }

    return runSegmentation(songContext);
  }, [runSegmentation, segmentationData, setShowSegmentation, showSegmentation]);

  const resetSegmentation = useCallback(() => {
    setSegmentationData(null);
    setShowSegmentation(false);
    setSegmentationError(null);
    setIsSegmenting(false);
  }, [setShowSegmentation]);

  return {
    segmentationData,
    showSegmentation,
    isSegmenting,
    segmentationError,
    setShowSegmentation,
    runSegmentation,
    toggleSegmentation,
    resetSegmentation,
  };
};
