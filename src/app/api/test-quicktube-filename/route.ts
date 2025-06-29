import { NextRequest, NextResponse } from 'next/server';
import { quickTubeFilenameGenerator } from '@/services/quickTubeFilenameGenerator';
import { quickTubeServiceSimplified } from '@/services/quickTubeServiceSimplified';

/**
 * Test QuickTube Filename Generation API
 * 
 * This endpoint tests our precise filename generation logic
 * against QuickTube's actual yt-dlp implementation.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title');
    const videoId = searchParams.get('videoId');
    const test = searchParams.get('test');

    if (test === 'all') {
      // Run all test cases
      console.log('🧪 Running QuickTube filename generation tests...');
      quickTubeServiceSimplified.testFilenameGeneration();
      
      return NextResponse.json({
        success: true,
        message: 'Test results logged to console',
        testCases: [
          {
            title: "HOÀNG DŨNG - ĐOẠN KẾT MỚI | OFFICIAL AUDIO",
            videoId: "cX2uLlc0su4",
            expected: "HOANG_DUNG_-_DOAN_KET_MOI_OFFICIAL_AUDIO-[cX2uLlc0su4].mp3"
          }
        ]
      });
    }

    if (!title || !videoId) {
      return NextResponse.json({
        success: false,
        error: 'Missing title or videoId parameters',
        usage: 'GET /api/test-quicktube-filename?title=VIDEO_TITLE&videoId=VIDEO_ID'
      }, { status: 400 });
    }

    // Generate filename candidates
    const candidates = quickTubeFilenameGenerator.generateFilename(title, videoId);

    // Test each candidate for availability
    const results = [];
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.downloadUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });

        results.push({
          filename: candidate.filename,
          downloadUrl: candidate.downloadUrl,
          method: candidate.method,
          available: response.ok,
          status: response.status,
          contentLength: response.headers.get('content-length'),
          contentType: response.headers.get('content-type')
        });

        if (response.ok) {
          console.log(`✅ Found available file: ${candidate.filename}`);
          break; // Stop at first successful match
        }
      } catch (error) {
        results.push({
          filename: candidate.filename,
          downloadUrl: candidate.downloadUrl,
          method: candidate.method,
          available: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      input: { title, videoId },
      candidates: results,
      summary: {
        totalCandidates: candidates.length,
        availableFiles: results.filter(r => r.available).length,
        bestMatch: results.find(r => r.available) || null
      }
    });

  } catch (error) {
    console.error('❌ QuickTube filename test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { title, videoId, testExtraction = false } = data;

    if (!title || !videoId) {
      return NextResponse.json({
        success: false,
        error: 'Missing title or videoId in request body'
      }, { status: 400 });
    }

    // Generate filename candidates
    const candidates = quickTubeServiceSimplified.generateFilenameCandidates(title, videoId);

    let extractionResult = null;
    if (testExtraction) {
      // Test actual extraction
      try {
        extractionResult = await quickTubeServiceSimplified.extractAudio(videoId, title);
      } catch (error) {
        extractionResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Extraction failed'
        };
      }
    }

    return NextResponse.json({
      success: true,
      input: { title, videoId },
      candidates: candidates.map(c => ({
        filename: c.filename,
        downloadUrl: c.downloadUrl,
        method: c.method
      })),
      extraction: extractionResult,
      analysis: {
        primaryFilename: candidates[0]?.filename,
        totalCandidates: candidates.length,
        method: candidates[0]?.method
      }
    });

  } catch (error) {
    console.error('❌ QuickTube filename test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
