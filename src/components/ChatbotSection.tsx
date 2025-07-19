'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import ChatbotButton from '@/components/ChatbotButton';
import { SongContext, SegmentationResult } from '@/types/chatbotTypes';

// Lazy load chatbot interface only when needed
const ChatbotInterface = dynamic(() => import('@/components/ChatbotInterface'), {
  loading: () => <div className="w-full h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

interface ChatbotSectionProps {
  isAvailable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  songContext: SongContext;
  onSegmentationResult?: (result: SegmentationResult) => void;
}

export const ChatbotSection: React.FC<ChatbotSectionProps> = ({
  isAvailable,
  isOpen,
  onToggle,
  onClose,
  songContext,
  onSegmentationResult
}) => {
  return (
    <>
      {isAvailable && (
        <>
          <ChatbotButton
            isOpen={isOpen}
            onClick={onToggle}
            disabled={!isAvailable}
          />
          <ChatbotInterface
            isOpen={isOpen}
            onClose={onClose}
            songContext={songContext}
            onSegmentationResult={onSegmentationResult}
          />
        </>
      )}
    </>
  );
};
