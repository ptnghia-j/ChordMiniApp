// Debug script to test chord grid data for both songs
const fetch = require('node-fetch');

// Mock analysis results for testing
const mockMadmomResults = {
  beatModel: 'madmom',
  chordModel: 'chord-cnn-lstm',
  beats: [
    { time: 0.01 }, // Very small first detected beat time
    { time: 0.5 },
    { time: 1.0 },
    { time: 1.5 }
  ],
  synchronizedChords: [
    { chord: 'N/C', beatIndex: 0 },
    { chord: 'N/C', beatIndex: 1 },
    { chord: 'N/C', beatIndex: 2 },
    { chord: 'B:maj/3', beatIndex: 3 }
  ],
  beatDetectionResult: {
    bpm: 120,
    time_signature: 4
  }
};

const mockBeatTransformerResults = {
  beatModel: 'beat-transformer',
  chordModel: 'chord-cnn-lstm',
  beats: [
    { time: 0.534 }, // Larger first detected beat time
    { time: 1.0 },
    { time: 1.5 },
    { time: 2.0 }
  ],
  synchronizedChords: [
    { chord: 'C', beatIndex: 0 },
    { chord: 'F', beatIndex: 1 },
    { chord: 'G', beatIndex: 2 },
    { chord: 'C', beatIndex: 3 }
  ],
  beatDetectionResult: {
    bpm: 120,
    time_signature: 4
  }
};

async function testChordGridData(name, analysisResults) {
  try {
    const response = await fetch('http://localhost:3000/api/debug-chord-grid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ analysisResults })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const debugInfo = await response.json();
    
    console.log(`\n🔍 DEBUG INFO FOR ${name}:`);
    console.log(`Beat Model: ${debugInfo.beatModel}`);
    console.log(`Chord Model: ${debugInfo.chordModel}`);
    console.log(`First Detected Beat: ${debugInfo.firstDetectedBeat}s`);
    console.log(`BPM: ${debugInfo.bpm}`);
    console.log(`Time Signature: ${debugInfo.timeSignature}`);
    console.log(`Has Padding: ${debugInfo.chordGridData.hasPadding}`);
    console.log(`Padding Count: ${debugInfo.chordGridData.paddingCount}`);
    console.log(`Shift Count: ${debugInfo.chordGridData.shiftCount}`);
    console.log(`Total Padding Count: ${debugInfo.chordGridData.totalPaddingCount}`);
    console.log(`Chords Length: ${debugInfo.chordGridData.chordsLength}`);
    console.log(`First 15 Chords: [${debugInfo.chordGridData.firstFifteenChords.map(c => `"${c}"`).join(', ')}]`);
    console.log(`Original Audio Mapping Length: ${debugInfo.chordGridData.originalAudioMappingLength}`);
    
    return debugInfo;
  } catch (error) {
    console.error(`Error testing ${name}:`, error);
    return null;
  }
}

async function main() {
  console.log('🔍 Testing Chord Grid Data for Both Models...\n');
  
  const madmomDebug = await testChordGridData('MADMOM MODEL (Problematic)', mockMadmomResults);
  const beatTransformerDebug = await testChordGridData('BEAT-TRANSFORMER MODEL (Working)', mockBeatTransformerResults);
  
  if (madmomDebug && beatTransformerDebug) {
    console.log('\n🔍 COMPARISON:');
    console.log(`Madmom firstDetectedBeat: ${madmomDebug.firstDetectedBeat}s vs Beat-Transformer: ${beatTransformerDebug.firstDetectedBeat}s`);
    console.log(`Madmom hasPadding: ${madmomDebug.chordGridData.hasPadding} vs Beat-Transformer: ${beatTransformerDebug.chordGridData.hasPadding}`);
    console.log(`Madmom paddingCount: ${madmomDebug.chordGridData.paddingCount} vs Beat-Transformer: ${beatTransformerDebug.chordGridData.paddingCount}`);
    console.log(`Madmom shiftCount: ${madmomDebug.chordGridData.shiftCount} vs Beat-Transformer: ${beatTransformerDebug.chordGridData.shiftCount}`);
  }
}

main().catch(console.error);
