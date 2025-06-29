import { NextRequest, NextResponse } from 'next/server';
import { getVideoTranscriptions } from '@/services/firestoreService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || 'H5BhwFlLON0';

    // console.log(`🔍 Verifying synchronized chords for video: ${videoId}`);

    // Get fresh data from Firestore
    const transcriptions = await getVideoTranscriptions(videoId);
    
    if (transcriptions.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No transcriptions found for video ${videoId}`,
        videoId
      });
    }
    
    const verification = transcriptions.map((data, index) => {
      const syncCount = data.synchronizedChords?.length || 0;
      const beatCount = data.beats?.length || 0;
      const chordCount = data.chords?.length || 0;
      
      // Sample some synchronized chords for verification
      const sampleSyncChords = data.synchronizedChords?.slice(0, 10) || [];
      
      return {
        index,
        beatModel: data.beatModel,
        chordModel: data.chordModel,
        counts: {
          beats: beatCount,
          chords: chordCount,
          synchronized: syncCount
        },
        hasData: {
          beats: beatCount > 0,
          chords: chordCount > 0,
          synchronized: syncCount > 0
        },
        sampleSyncChords,
        dataConsistency: {
          syncCountMatchesBeats: syncCount === beatCount,
          syncCountReasonable: syncCount > 0 && syncCount <= beatCount * 2
        },
        lastUpdated: data.createdAt?.toDate?.() || data.createdAt
      };
    });
    
    const totalSyncChords = verification.reduce((sum, v) => sum + v.counts.synchronized, 0);
    const allHaveSyncData = verification.every(v => v.hasData.synchronized);
    
    return NextResponse.json({
      success: true,
      videoId,
      timestamp: new Date().toISOString(),
      summary: {
        totalTranscriptions: transcriptions.length,
        totalSynchronizedChords: totalSyncChords,
        allHaveSynchronizedData: allHaveSyncData,
        averageSyncPerTranscription: totalSyncChords / transcriptions.length
      },
      verification
    });
    
  } catch (error) {
    console.error('❌ Error in verification API:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
