#!/usr/bin/env node

/**
 * Script to regenerate missing synchronized chords for affected videos
 * This fixes the blob API synchronization bug by re-processing cached data
 */

import { getVideoTranscriptions, saveTranscription } from '../../src/services/firebase/firestoreService';
import { synchronizeChords } from '../../src/utils/chordSynchronization';
import type { TranscriptionData } from '../../src/services/firebase/firestoreService';

// Define interfaces locally since they're not exported
interface BeatInfo {
  time: number;
  strength: number;
  beatNum: number;
}

interface ChordDetectionResult {
  start: number;
  end: number;
  time: number;
  chord: string;
  confidence: number;
}

const AFFECTED_VIDEO_ID = 'H5BhwFlLON0';

interface RegenerationResult {
  videoId: string;
  originalSyncCount: number;
  newSyncCount: number;
  success: boolean;
  error?: string;
}

async function regenerateSynchronizedChords(videoId: string): Promise<RegenerationResult> {
  try {
    console.log(`🔍 Processing video: ${videoId}`);
    
    // Get all transcriptions for this video
    const transcriptions = await getVideoTranscriptions(videoId);
    
    if (transcriptions.length === 0) {
      return {
        videoId,
        originalSyncCount: 0,
        newSyncCount: 0,
        success: false,
        error: 'No transcriptions found'
      };
    }
    
    console.log(`Found ${transcriptions.length} transcription(s) for video ${videoId}`);
    
    let processedCount = 0;
    let totalOriginalSync = 0;
    let totalNewSync = 0;
    
    for (const transcription of transcriptions) {
      console.log(`\n📄 Processing transcription: ${transcription.beatModel} + ${transcription.chordModel}`);
      
      const originalSyncCount = transcription.synchronizedChords?.length || 0;
      totalOriginalSync += originalSyncCount;
      
      console.log(`  Original synchronized chords: ${originalSyncCount}`);
      console.log(`  Available beats: ${transcription.beats?.length || 0}`);
      console.log(`  Available chords: ${transcription.chords?.length || 0}`);
      
      // Check if we need to regenerate
      if (originalSyncCount === 0 && transcription.beats && transcription.chords) {
        console.log(`  🔄 Regenerating synchronized chords...`);
        
        try {
          // Convert beats to BeatInfo format if needed
          const beats: BeatInfo[] = transcription.beats.map((beat, index) => {
            if (typeof beat === 'number') {
              return {
                time: beat,
                strength: 0.8,
                beatNum: (index % (transcription.timeSignature || 4)) + 1
              };
            } else if (typeof beat === 'object' && 'time' in beat) {
              return beat as BeatInfo;
            } else {
              throw new Error(`Invalid beat format at index ${index}: ${JSON.stringify(beat)}`);
            }
          });
          
          // Convert chords to ChordDetectionResult format if needed
          const chords: ChordDetectionResult[] = transcription.chords.map(chord => ({
            start: chord.start,
            end: chord.end,
            time: chord.start, // Required property - alias for start
            chord: chord.chord,
            confidence: chord.confidence || 0.8
          }));
          
          // Regenerate synchronized chords
          const newSynchronizedChords = synchronizeChords(chords, beats);
          
          console.log(`  ✅ Generated ${newSynchronizedChords.length} synchronized chords`);
          totalNewSync += newSynchronizedChords.length;
          
          // Update the transcription data
          const updatedTranscription: TranscriptionData = {
            ...transcription,
            synchronizedChords: newSynchronizedChords
          };
          
          // Save back to Firestore
          await saveTranscription(updatedTranscription);
          
          console.log(`  💾 Updated transcription saved to Firestore`);
          processedCount++;
          
        } catch (syncError) {
          console.error(`  ❌ Failed to regenerate synchronized chords:`, syncError);
          throw syncError;
        }
        
      } else if (originalSyncCount > 0) {
        console.log(`  ✅ Already has synchronized chords, skipping`);
        totalNewSync += originalSyncCount;
      } else {
        console.log(`  ⚠️  Missing beats or chords data, cannot regenerate`);
      }
    }
    
    console.log(`\n📊 SUMMARY for ${videoId}:`);
    console.log(`  Transcriptions processed: ${processedCount}/${transcriptions.length}`);
    console.log(`  Original sync count: ${totalOriginalSync}`);
    console.log(`  New sync count: ${totalNewSync}`);
    
    return {
      videoId,
      originalSyncCount: totalOriginalSync,
      newSyncCount: totalNewSync,
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Error processing video ${videoId}:`, error);
    return {
      videoId,
      originalSyncCount: 0,
      newSyncCount: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function main() {
  console.log('🚀 Starting synchronized chords regeneration script');
  console.log('=' .repeat(80));
  
  try {
    // Process the affected video
    const result = await regenerateSynchronizedChords(AFFECTED_VIDEO_ID);
    
    console.log('\n🏁 FINAL RESULTS:');
    console.log('=' .repeat(80));
    console.log(`Video: ${result.videoId}`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    console.log(`Original synchronized chords: ${result.originalSyncCount}`);
    console.log(`New synchronized chords: ${result.newSyncCount}`);
    
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    
    if (result.success && result.newSyncCount > result.originalSyncCount) {
      console.log('\n🎉 SUCCESS: Synchronized chords have been regenerated!');
      console.log('The video should now display properly in the grid visualization.');
    } else if (result.success && result.newSyncCount === result.originalSyncCount && result.originalSyncCount > 0) {
      console.log('\n✅ No regeneration needed - synchronized chords already exist.');
    } else {
      console.log('\n⚠️  No improvement achieved - check the error details above.');
    }
    
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().then(() => {
    console.log('\n🏁 Script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

export { regenerateSynchronizedChords };
