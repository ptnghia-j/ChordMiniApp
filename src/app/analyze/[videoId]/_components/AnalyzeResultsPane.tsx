'use client';

import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import AnalysisHeader from '@/components/analysis/AnalysisHeader';
import ResultsTabs from '@/components/homepage/ResultsTabs';
import BeatTimeline from '@/components/analysis/BeatTimeline';
import {
  ChordGridSkeleton,
  LyricsSkeleton,
} from '@/components/common/SkeletonLoaders';
import type { AnalyzeResultsPaneProps } from '../_types/analyzePageViewModel';
import AnalyzeEmptyState from './AnalyzeEmptyState';

const AnalysisSummary = dynamic(() => import('@/components/analysis/AnalysisSummary'), {
  loading: () => <div className="h-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

const ChordGridContainer = dynamic(() => import('@/components/chord-analysis/ChordGridContainer').then(mod => ({ default: mod.ChordGridContainer })), {
  loading: () => <ChordGridSkeleton />,
  ssr: false,
});

const LyricsSection = dynamic(() => import('@/components/lyrics/LyricsSection').then(mod => ({ default: mod.LyricsSection })), {
  loading: () => <LyricsSkeleton />,
  ssr: false,
});

const GuitarChordsTab = dynamic(() => import('@/components/chord-analysis/GuitarChordsTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

const PianoVisualizerTab = dynamic(() => import('@/components/piano-visualizer/PianoVisualizerTab'), {
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false,
});

export default function AnalyzeResultsPane(props: AnalyzeResultsPaneProps) {
  const analysisResults =
    props.analysisResults as unknown as NonNullable<ComponentProps<typeof AnalysisSummary>['analysisResults']>;
  const chordGridData =
    props.chordGridData as unknown as ComponentProps<typeof ChordGridContainer>['chordGridData'];
  const segmentationData =
    props.segmentationData as unknown as ComponentProps<typeof ChordGridContainer>['segmentationData'];
  const sequenceCorrections =
    props.sequenceCorrections as unknown as ComponentProps<typeof ChordGridContainer>['sequenceCorrections'];
  const sheetSageResult =
    props.sheetSageResult as unknown as ComponentProps<typeof PianoVisualizerTab>['sheetSageResult'];

  const hasAnalysis = Boolean(props.analysisResults && props.isAnalyzed);

  if (!hasAnalysis) {
    return <AnalyzeEmptyState />;
  }

  return (
    <div className="space-y-2">
      <AnalysisHeader
        videoTitle={props.videoTitle}
        isEditMode={props.isEditMode}
        editedTitle={props.editedTitle}
        onTitleChange={props.onTitleChange}
        onEditToggle={props.onEditToggle}
        onTitleSave={props.onTitleSave}
        onTitleCancel={props.onTitleCancel}
        showCorrectedChords={props.showCorrectedChords}
        hasCorrections={props.hasCorrections}
        toggleEnharmonicCorrection={props.toggleEnharmonicCorrection}
        isTranscribingLyrics={props.isTranscribingLyrics}
        hasCachedLyrics={props.hasCachedLyrics}
        canTranscribe={props.canTranscribe}
        transcribeLyricsWithAI={props.transcribeLyricsWithAI}
        lyricsError={props.lyricsError}
      />

      <ResultsTabs
        activeTab={props.activeTab}
        setActiveTab={props.setActiveTab}
        showLyrics={props.showLyrics}
        hasCachedLyrics={props.hasCachedLyrics}
      />

      <div className="tab-content">
        {props.activeTab === 'beatChordMap' && (
          <div>
            <ChordGridContainer
              chordGridData={chordGridData}
              isChatbotOpen={props.isChatbotOpen}
              isLyricsPanelOpen={props.isLyricsPanelOpen}
              segmentationData={segmentationData}
              isEditMode={props.isEditMode}
              editedChords={props.editedChords}
              onChordEdit={props.onChordEdit}
              showCorrectedChords={props.showCorrectedChords}
              sequenceCorrections={sequenceCorrections}
            />

            <AnalysisSummary
              analysisResults={analysisResults}
              audioDuration={props.duration}
              videoTitle={props.videoTitle}
              usageCount={props.activeTranscriptionUsageCount}
            >
              <BeatTimeline
                beats={props.analysisResults?.beats || []}
                downbeats={props.analysisResults?.downbeats || []}
                currentBeatIndex={props.currentBeatIndex}
                currentDownbeatIndex={props.currentDownbeatIndex}
                duration={props.duration}
                embedded
              />
            </AnalysisSummary>
          </div>
        )}

        {props.activeTab === 'guitarChords' && (
          <GuitarChordsTab
            chordGridData={chordGridData}
            isChatbotOpen={props.isChatbotOpen}
            isLyricsPanelOpen={props.isLyricsPanelOpen}
            isUploadPage={false}
            sequenceCorrections={sequenceCorrections}
            segmentationData={segmentationData}
            isChordPlaybackEnabled={props.isChordPlaybackEnabled}
            audioUrl={props.audioUrl}
          />
        )}

        {props.activeTab === 'pianoVisualizer' && (
          <PianoVisualizerTab
            analysisResults={analysisResults}
            chordGridData={chordGridData}
            keySignature={props.keySignature}
            sequenceCorrections={sequenceCorrections}
            segmentationData={segmentationData}
            currentTime={props.currentTime}
            currentBeatIndex={props.currentBeatIndex}
            isPlaying={props.isPlaying}
            isChordPlaybackEnabled={props.isChordPlaybackEnabled}
            audioUrl={props.audioUrl}
            sheetSageResult={sheetSageResult}
            showMelodicOverlay={props.showMelodicOverlay}
          />
        )}
      </div>

      {props.activeTab === 'lyricsChords' && (
        <LyricsSection
          lyrics={props.lyrics}
          showLyrics={props.showLyrics}
          hasCachedLyrics={props.hasCachedLyrics}
          currentTime={props.currentTime}
          fontSize={props.fontSize}
          onFontSizeChange={props.onFontSizeChange}
          theme={props.theme}
          analysisResults={analysisResults}
          segmentationData={segmentationData}
          sequenceCorrections={sequenceCorrections}
        />
      )}
    </div>
  );
}
