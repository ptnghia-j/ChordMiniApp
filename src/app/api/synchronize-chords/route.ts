import { NextRequest, NextResponse } from 'next/server';
import { synchronizeChords } from '@/services/chordRecognitionService';

// Define interfaces for the synchronization request
interface ChordDetectionResult {
  start: number;
  end: number;
  time: number;
  chord: string;
  confidence: number;
}

interface BeatInfo {
  time: number;
  strength: number;
  beatNum: number;
}

interface SynchronizeRequest {
  chords: ChordDetectionResult[];
  beats: number[] | BeatInfo[];
}

export async function POST(request: NextRequest) {
  try {
    const { chords, beats }: SynchronizeRequest = await request.json();

    // Validate input
    if (!chords || !Array.isArray(chords)) {
      return NextResponse.json({
        success: false,
        error: 'Chords array is required'
      }, { status: 400 });
    }

    if (!beats || !Array.isArray(beats)) {
      return NextResponse.json({
        success: false,
        error: 'Beats array is required'
      }, { status: 400 });
    }

    if (chords.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Chords array cannot be empty'
      }, { status: 400 });
    }

    if (beats.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Beats array cannot be empty'
      }, { status: 400 });
    }

    console.log(`🔄 Synchronizing ${chords.length} chords with ${beats.length} beats...`);

    // Convert beats to BeatInfo format if they're just numbers
    const beatInfoArray: BeatInfo[] = beats.map((beat, index) => {
      if (typeof beat === 'number') {
        return {
          time: beat,
          strength: 0.8,
          beatNum: (index % 4) + 1 // Default to 4/4 time signature
        };
      } else if (typeof beat === 'object' && 'time' in beat) {
        return beat as BeatInfo;
      } else {
        throw new Error(`Invalid beat format at index ${index}: ${JSON.stringify(beat)}`);
      }
    });

    // Validate chord format
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      if (!chord || typeof chord !== 'object') {
        return NextResponse.json({
          success: false,
          error: `Invalid chord format at index ${i}: expected object`
        }, { status: 400 });
      }

      if (typeof chord.start !== 'number' || typeof chord.end !== 'number') {
        return NextResponse.json({
          success: false,
          error: `Invalid chord timing at index ${i}: start and end must be numbers`
        }, { status: 400 });
      }

      if (typeof chord.chord !== 'string') {
        return NextResponse.json({
          success: false,
          error: `Invalid chord name at index ${i}: chord must be a string`
        }, { status: 400 });
      }
    }

    // Validate beat timing
    for (let i = 0; i < beatInfoArray.length; i++) {
      const beat = beatInfoArray[i];
      if (typeof beat.time !== 'number' || isNaN(beat.time) || beat.time < 0) {
        return NextResponse.json({
          success: false,
          error: `Invalid beat timing at index ${i}: ${beat.time}`
        }, { status: 400 });
      }
    }

    // Perform synchronization
    const synchronizedChords = synchronizeChords(chords, beatInfoArray);

    console.log(`✅ Synchronization completed: ${synchronizedChords.length} synchronized chords`);

    return NextResponse.json({
      success: true,
      synchronizedChords,
      summary: {
        inputChords: chords.length,
        inputBeats: beats.length,
        outputSynchronizedChords: synchronizedChords.length
      }
    });

  } catch (error) {
    console.error('❌ Error in chord synchronization API:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown synchronization error'
    }, { status: 500 });
  }
}
