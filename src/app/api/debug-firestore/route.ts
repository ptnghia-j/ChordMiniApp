import { NextRequest, NextResponse } from 'next/server';
import { getVideoTranscriptions } from '@/services/firestoreService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || 'H5BhwFlLON0';

    // console.log(`🔍 Debug: Investigating Firestore data for video: ${videoId}`);

    // Get all transcriptions for this video
    const transcriptions = await getVideoTranscriptions(videoId);
    
    console.log(`Found ${transcriptions.length} transcription(s) for video ${videoId}`);
    
    if (transcriptions.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No transcriptions found for video ${videoId}`,
        videoId,
        transcriptions: []
      });
    }
    
    // Analyze each transcription
    const analysis = transcriptions.map((data, index) => {
      const basicInfo = {
        videoId: data.videoId,
        beatModel: data.beatModel,
        chordModel: data.chordModel,
        audioDuration: data.audioDuration,
        timeSignature: data.timeSignature,
        bpm: data.bpm,
        beatShift: data.beatShift,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
      };
      
      const beatData = {
        totalBeats: data.beats?.length || 0,
        beatDataType: data.beats?.length > 0 ? typeof data.beats[0] : 'none',
        isNumberArray: data.beats?.length > 0 && typeof data.beats[0] === 'number',
        isObjectArray: data.beats?.length > 0 && typeof data.beats[0] === 'object',
        firstTenBeats: data.beats?.slice(0, 10) || [],
        beatObjectKeys: data.beats?.length > 0 && typeof data.beats[0] === 'object' 
          ? Object.keys(data.beats[0]) : []
      };
      
      const chordData = {
        totalChords: data.chords?.length || 0,
        firstTenChords: data.chords?.slice(0, 10) || [],
        chordObjectKeys: data.chords?.length > 0 ? Object.keys(data.chords[0]) : []
      };
      
      const synchronizedData = {
        totalSynchronized: data.synchronizedChords?.length || 0,
        firstTwentySynced: data.synchronizedChords?.slice(0, 20) || [],
        syncObjectKeys: data.synchronizedChords?.length > 0 ? Object.keys(data.synchronizedChords[0]) : [],
        beatIndexRange: data.synchronizedChords?.length > 0 ? {
          min: Math.min(...data.synchronizedChords.map(sc => sc.beatIndex)),
          max: Math.max(...data.synchronizedChords.map(sc => sc.beatIndex))
        } : null
      };
      
      const dataConsistency = {
        maxBeatIndex: synchronizedData.beatIndexRange?.max || -1,
        beatsArrayLength: beatData.totalBeats,
        hasIndexMismatch: synchronizedData.beatIndexRange ? 
          synchronizedData.beatIndexRange.max >= beatData.totalBeats : false
      };
      
      return {
        index,
        docId: `${data.videoId}_${data.beatModel}_${data.chordModel}`,
        basicInfo,
        beatData,
        chordData,
        synchronizedData,
        dataConsistency,
        keyData: {
          keySignature: data.keySignature,
          keyModulation: data.keyModulation,
          hasChordCorrections: !!data.chordCorrections,
          hasOriginalChords: !!data.originalChords,
          hasCorrectedChords: !!data.correctedChords
        }
      };
    });
    
    return NextResponse.json({
      success: true,
      videoId,
      totalTranscriptions: transcriptions.length,
      analysis,
      rawData: transcriptions // Include raw data for detailed inspection
    });
    
  } catch (error) {
    console.error('❌ Error in debug-firestore API:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      videoId: 'H5BhwFlLON0'
    }, { status: 500 });
  }
}
