import { useState, useCallback } from 'react';
import { SegmentationResult } from '@/types/chatbotTypes';

/**
 * Custom hook to manage segmentation state and handlers
 * Extracted from the main page component to isolate segmentation logic
 */
export const useSegmentationState = () => {
  const [segmentationData, setSegmentationData] = useState<SegmentationResult | null>(null);
  const [showSegmentation, setShowSegmentation] = useState(false);

  const handleSegmentationResult = useCallback((result: SegmentationResult) => {
    setSegmentationData(result);
    setShowSegmentation(true);
    console.log('🎵 Segmentation result received:', result);
  }, []);

  return {
    segmentationData,
    showSegmentation,
    setShowSegmentation,
    handleSegmentationResult,
  };
};
