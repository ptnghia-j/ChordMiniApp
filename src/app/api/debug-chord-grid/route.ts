import { NextRequest, NextResponse } from 'next/server';
import { getChordGridData } from '@/services/chordGridProcessor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisResults } = body;

    if (!analysisResults) {
      return NextResponse.json({ error: 'Missing analysisResults' }, { status: 400 });
    }

    // Process the analysis results to get chord grid data
    const chordGridData = getChordGridData(analysisResults);

    // Return debug information
    const debugInfo = {
      beatModel: analysisResults.beatModel,
      chordModel: analysisResults.chordModel,
      firstDetectedBeat: analysisResults.beats.length > 0 ? 
        (typeof analysisResults.beats[0] === 'object' ? analysisResults.beats[0].time : analysisResults.beats[0]) : 0,
      bpm: analysisResults.beatDetectionResult?.bpm || 120,
      timeSignature: analysisResults.beatDetectionResult?.time_signature || 4,
      chordGridData: {
        hasPadding: chordGridData.hasPadding,
        paddingCount: chordGridData.paddingCount,
        shiftCount: chordGridData.shiftCount,
        totalPaddingCount: chordGridData.totalPaddingCount,
        chordsLength: chordGridData.chords.length,
        firstFifteenChords: chordGridData.chords.slice(0, 15),
        originalAudioMappingLength: chordGridData.originalAudioMapping?.length || 0
      }
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug chord grid error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
