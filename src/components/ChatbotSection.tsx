'use client';

import React from 'react';
import ChatbotButton from '@/components/ChatbotButton';
import ChatbotInterface from '@/components/ChatbotInterface';
import { SongContext } from '@/types/chatbotTypes';

interface ChatbotSectionProps {
  isAvailable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  songContext: SongContext;
}

export const ChatbotSection: React.FC<ChatbotSectionProps> = ({
  isAvailable,
  isOpen,
  onToggle,
  onClose,
  songContext
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
          />
        </>
      )}
    </>
  );
};
