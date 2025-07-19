import { NextRequest, NextResponse } from 'next/server';
import { getVideoTranscriptions, saveTranscription } from '@/services/firestoreService';
import { synchronizeChords } from '@/services/chordRecognitionService';
import { auth } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';

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

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json();

    if (!videoId) {
      return NextResponse.json({
        success: false,
        error: 'Video ID is required'
      }, { status: 400 });
    }

    console.log(`🔄 Starting regeneration for video: ${videoId}`);

    // Ensure authentication before proceeding
    if (auth && !auth.currentUser) {
      console.log('🔐 Authenticating anonymously for regeneration...');
      try {
        await signInAnonymously(auth);
        console.log('✅ Anonymous authentication successful for regeneration');
      } catch (authError) {
        console.error('❌ Authentication failed:', authError);
        return NextResponse.json({
          success: false,
          error: 'Authentication failed'
        }, { status: 500 });
      }
    }
    
    // Get all transcriptions for this video
    const transcriptions = await getVideoTranscriptions(videoId);
    
    if (transcriptions.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No transcriptions found for video ${videoId}`,
        videoId
      });
    }
    
    console.log(`Found ${transcriptions.length} transcription(s) for video ${videoId}`);
    
    let processedCount = 0;
    let totalOriginalSync = 0;
    let totalNewSync = 0;
    const results = [];
    
    for (const transcription of transcriptions) {
      console.log(`\n📄 Processing: ${transcription.beatModel} + ${transcription.chordModel}`);
      
      const originalSyncCount = transcription.synchronizedChords?.length || 0;
      totalOriginalSync += originalSyncCount;
      
      const result = {
        beatModel: transcription.beatModel,
        chordModel: transcription.chordModel,
        originalSyncCount,
        newSyncCount: originalSyncCount,
        processed: false,
        error: null as string | null
      };
      
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
              throw new Error(`Invalid beat format at index ${index}`);
            }
          });
          
          // Convert chords to ChordDetectionResult format if needed
          const chords: ChordDetectionResult[] = transcription.chords.map(chord => ({
            start: chord.start,
            end: chord.end,
            time: chord.start,
            chord: chord.chord,
            confidence: chord.confidence || 0.8
          }));
          
          // Regenerate synchronized chords
          const newSynchronizedChords = synchronizeChords(chords, beats);
          
          console.log(`  ✅ Generated ${newSynchronizedChords.length} synchronized chords`);
          
          // Update the transcription data (exclude createdAt for saveTranscription)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { createdAt, ...transcriptionWithoutCreatedAt } = transcription;
          const updatedTranscription = {
            ...transcriptionWithoutCreatedAt,
            synchronizedChords: newSynchronizedChords
          };

          // Save back to Firestore
          await saveTranscription(updatedTranscription);
          
          console.log(`  💾 Updated transcription saved to Firestore`);
          
          result.newSyncCount = newSynchronizedChords.length;
          result.processed = true;
          totalNewSync += newSynchronizedChords.length;
          processedCount++;
          
        } catch (syncError) {
          console.error(`  ❌ Failed to regenerate:`, syncError);
          result.error = syncError instanceof Error ? syncError.message : 'Unknown error';
          totalNewSync += originalSyncCount; // Keep original count
        }
        
      } else if (originalSyncCount > 0) {
        console.log(`  ✅ Already has synchronized chords, skipping`);
        totalNewSync += originalSyncCount;
      } else {
        console.log(`  ⚠️  Missing beats or chords data, cannot regenerate`);
        result.error = 'Missing beats or chords data';
      }
      
      results.push(result);
    }
    
    console.log(`\n📊 SUMMARY for ${videoId}:`);
    console.log(`  Transcriptions processed: ${processedCount}/${transcriptions.length}`);
    console.log(`  Original sync count: ${totalOriginalSync}`);
    console.log(`  New sync count: ${totalNewSync}`);
    
    return NextResponse.json({
      success: true,
      videoId,
      summary: {
        totalTranscriptions: transcriptions.length,
        processedCount,
        originalSyncCount: totalOriginalSync,
        newSyncCount: totalNewSync,
        improvement: totalNewSync - totalOriginalSync
      },
      results
    });
    
  } catch (error) {
    console.error('❌ Error in regeneration API:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
