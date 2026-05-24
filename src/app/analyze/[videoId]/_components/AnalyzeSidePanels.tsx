'use client';

import dynamic from 'next/dynamic';
import { ChatbotSkeleton } from '@/components/common/SkeletonLoaders';
import type { AnalyzeSidePanelsProps } from '../_types/analyzePageViewModel';

const ChatbotInterfaceDyn = dynamic(() => import('@/components/chatbot/ChatbotInterface'), {
  loading: () => <ChatbotSkeleton />,
  ssr: false,
});

export default function AnalyzeSidePanels({
  isChatbotOpen,
  closeChatbot,
  songContext,
}: AnalyzeSidePanelsProps) {
  return (
    <div className="pl-2 h-full flex flex-col gap-4">
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <div className="w-full h-full relative">
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
