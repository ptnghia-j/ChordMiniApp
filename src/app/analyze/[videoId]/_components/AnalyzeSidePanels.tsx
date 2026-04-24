'use client';

import dynamic from 'next/dynamic';
import { ChatbotSkeleton } from '@/components/common/SkeletonLoaders';
import type { AnalyzeSidePanelsProps } from '../_types/analyzePageViewModel';

const LyricsPanel = dynamic(() => import('@/components/lyrics/LyricsPanel'), {
  loading: () => <div className="fixed right-4 bottom-16 w-96 h-96 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

const ChatbotInterfaceDyn = dynamic(() => import('@/components/chatbot/ChatbotInterface'), {
  loading: () => <ChatbotSkeleton />,
  ssr: false,
});

export default function AnalyzeSidePanels({
  isLyricsPanelOpen,
  isChatbotOpen,
  closeLyricsPanel,
  closeChatbot,
  videoTitle,
  currentTime,
  songContext,
}: AnalyzeSidePanelsProps) {
  return (
    <div className="pl-2 h-full flex flex-col gap-4">
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <div className="w-full h-full relative">
            <div className={`absolute inset-0 transition-all duration-300 ${isLyricsPanelOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <LyricsPanel
                isOpen={isLyricsPanelOpen}
                onClose={closeLyricsPanel}
                videoTitle={videoTitle}
                currentTime={currentTime}
                className="static inset-auto w-full h-full max-h-none max-w-none rounded-lg shadow-sm"
                embedded
              />
            </div>
            <div className={`absolute inset-0 transition-all duration-300 ${isChatbotOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <ChatbotInterfaceDyn
                isOpen={isChatbotOpen}
                onClose={closeChatbot}
                songContext={songContext}
                className="static inset-auto w-full h-full max-h-none max-w-none rounded-lg shadow-sm"
                embedded
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
