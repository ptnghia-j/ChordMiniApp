/**
 * Audio Processing Comparison Test Page
 * Demonstrates the performance comparison between Appwrite and downr.org + conversion
 */

import AudioProcessingComparison from '@/components/AudioProcessingComparison';

export default function AudioComparisonPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AudioProcessingComparison />
    </div>
  );
}

export const metadata = {
  title: 'Audio Processing Comparison - ChordMiniApp',
  description: 'Compare performance between Appwrite and downr.org + Opus→MP3 conversion approaches for YouTube audio processing',
};
