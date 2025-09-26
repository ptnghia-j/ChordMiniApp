import { NextRequest, NextResponse } from 'next/server';
import { scrapingBeeService } from '@/services/scrapingBeeAudioService';

export async function POST(request: NextRequest) {
  try {
    const { googleVideoUrl } = await request.json();
    
    if (!googleVideoUrl) {
      return NextResponse.json({
        success: false,
        error: 'googleVideoUrl parameter is required'
      }, { status: 400 });
    }

    console.log(`🧪 Testing ScrapingBee download with Google Video URL: ${googleVideoUrl.substring(0, 100)}...`);
    
    // Test download with ScrapingBee
    const startTime = Date.now();
    const result = await scrapingBeeService.downloadAudio(googleVideoUrl);
    const downloadTime = Date.now() - startTime;
    
    console.log('📊 ScrapingBee Download Result:', {
      success: result.success,
      error: result.error,
      contentType: result.contentType,
      bufferSize: result.audioBuffer?.byteLength,
      downloadTime
    });

    if (result.success && result.audioBuffer) {
      const fileSizeMB = (result.audioBuffer.byteLength / 1024 / 1024).toFixed(2);
      
      return NextResponse.json({
        success: true,
        message: 'ScrapingBee download successful',
        stats: {
          fileSizeMB: parseFloat(fileSizeMB),
          fileSizeBytes: result.audioBuffer.byteLength,
          contentType: result.contentType,
          downloadTimeMs: downloadTime,
          finalUrl: result.finalUrl
        },
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'ScrapingBee download failed',
        details: result.error,
        statusCode: result.statusCode,
        contentType: result.contentType
      }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ ScrapingBee download test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test ScrapingBee download',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
