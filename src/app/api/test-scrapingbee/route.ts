import { NextRequest, NextResponse } from 'next/server';
import { scrapingBeeService } from '@/services/scrapingBeeAudioService';

export async function GET() {
  try {
    console.log('🧪 Testing ScrapingBee service...');
    
    // Test service health first
    const healthCheck = await scrapingBeeService.checkServiceHealth();
    console.log('📊 Health Check Result:', healthCheck);
    
    if (!healthCheck.available) {
      return NextResponse.json({
        success: false,
        error: 'ScrapingBee service is not available',
        details: healthCheck.error
      }, { status: 503 });
    }

    // Get service info
    const serviceInfo = scrapingBeeService.getServiceInfo();
    console.log('ℹ️ Service Info:', serviceInfo);

    return NextResponse.json({
      success: true,
      message: 'ScrapingBee service is healthy and ready',
      serviceInfo,
      healthCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ScrapingBee test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test ScrapingBee service',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { testUrl } = await request.json();
    
    if (!testUrl) {
      return NextResponse.json({
        success: false,
        error: 'testUrl parameter is required'
      }, { status: 400 });
    }

    console.log(`🧪 Testing ScrapingBee download with URL: ${testUrl}`);
    
    // Test download with ScrapingBee
    const startTime = Date.now();
    const result = await scrapingBeeService.downloadAudio(testUrl);
    const downloadTime = Date.now() - startTime;
    
    console.log('📊 Download Result:', {
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
