import { NextResponse } from 'next/server';

/**
 * Test endpoint to verify chord recognition works with mock fallback in localhost development
 */
export async function POST(request: Request) {
  try {
    const { audioUrl, model = 'chord-cnn-lstm' } = await request.json();
    
    if (!audioUrl) {
      return NextResponse.json(
        { error: 'Missing audioUrl parameter' },
        { status: 400 }
      );
    }
    
    console.log(`🧪 Testing chord recognition for audio URL: ${audioUrl.substring(0, 100)}...`);
    
    const startTime = Date.now();
    
    // Import the chord recognition service
    const { analyzeAudioWithRateLimit } = await import('@/services/chord-analysis/chordRecognitionService');
    
    // Download the audio file first (simulating the same flow as the main app)
    const encodedUrl = encodeURIComponent(audioUrl);
    const proxyUrl = `/api/proxy-audio?url=${encodedUrl}`;
    
    console.log(`🔧 Downloading audio via proxy: ${proxyUrl}`);
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    const audioBlob = await response.blob();
    const audioFile = new File([audioBlob], "test_audio.wav", { type: "audio/wav" });
    
    console.log(`✅ Downloaded audio file: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Test chord recognition (this should use mock data if Python backend is not running)
    const result = await analyzeAudioWithRateLimit(audioFile, 'beat-transformer', model);
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    return NextResponse.json({
      success: true,
      testResult: {
        approach: 'Hybrid (proxy download + mock fallback for localhost)',
        processingTime: `${processingTime.toFixed(1)} seconds`,
        chordsDetected: result.chords.length,
        model: result.chords.length > 0 ? `${model}${result.chords[0].chord.includes('mock') ? '-mock-development' : ''}` : model,
        backendConnectivity: result.chords.length > 0 && result.chords[0].chord ?
          (result.chords[0].chord.includes('mock') ? 'Mock data (Python backend not required)' : 'Real ML processing') :
          'Unknown',
        developmentMode: result.chords.length > 0 && result.chords[0].chord ?
          (result.chords[0].chord.includes('mock') ? 'Mock chord recognition enabled for development' : 'Real ML processing') :
          'Unknown'
      },
      chordData: {
        chords: result.chords.slice(0, 10), // First 10 chords for testing
        totalChords: result.chords.length,
        duration: result.chords.length > 0 ? result.chords[result.chords.length - 1].end : 0,
        sampleProgression: result.chords.slice(0, 5).map(c => c.chord).join(' - ')
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL,
        approach: 'Audio URL → /api/proxy-audio → File → analyzeAudioWithRateLimit → Mock/Real chords'
      }
    });
    
  } catch (error) {
    console.error('Chord recognition test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      testResult: {
        approach: 'Hybrid (proxy download + mock fallback for localhost)',
        status: 'Failed',
        suggestion: 'Check if /api/proxy-audio is working. Mock chord recognition should work even without Python backend.'
      }
    }, { status: 500 });
  }
}

/**
 * GET endpoint to show test instructions
 */
export async function GET() {
  return NextResponse.json({
    testEndpoint: '/api/test-chord-recognition',
    method: 'POST',
    description: 'Test chord recognition with mock fallback for localhost development',
    requestBody: {
      audioUrl: 'https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o/audio%2Ffile.mp3?alt=media&token=...',
      model: 'chord-cnn-lstm' // optional, defaults to 'chord-cnn-lstm'
    },
    example: {
      curl: 'curl -X POST http://localhost:3000/api/test-chord-recognition -H "Content-Type: application/json" -d \'{"audioUrl": "YOUR_AUDIO_URL"}\''
    },
    approach: {
      step1: 'Download audio file via /api/proxy-audio',
      step2: 'Create File object from downloaded blob',
      step3: 'Call analyzeAudioWithRateLimit() with environment detection',
      step4: 'Use mock chord data if Python backend unavailable (403 error)',
      benefits: ['No Python backend required', 'Consistent with beat detection', 'Enables full development workflow']
    },
    mockChordData: {
      chords: ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'C7', 'F/C', 'G/B', 'Am7', 'Bb', 'D'],
      interval: '2 seconds per chord',
      confidence: '0.85-0.95 (randomized)'
    }
  });
}
