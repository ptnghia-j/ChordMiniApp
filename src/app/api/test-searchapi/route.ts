import { NextRequest, NextResponse } from 'next/server';
import { searchApiService } from '@/services/searchApiAudioService';

export async function GET() {
  try {
    console.log('🧪 Testing SearchAPI.io service...');
    
    // Check service configuration
    const isConfigured = searchApiService.isConfigured();
    console.log('🔧 SearchAPI.io configured:', isConfigured);
    
    if (!isConfigured) {
      return NextResponse.json({
        success: false,
        error: 'SearchAPI.io service not configured',
        message: 'SEARCHAPI_API_KEY environment variable is missing'
      }, { status: 500 });
    }

    // Perform health check
    const healthCheck = await searchApiService.healthCheck();
    console.log('📊 Health Check Result:', healthCheck);

    // Service info
    const serviceInfo = {
      name: 'SearchAPI.io',
      baseUrl: 'https://www.searchapi.io/api/v1/',
      hasApiKey: isConfigured
    };
    console.log('ℹ️ Service Info:', serviceInfo);

    if (healthCheck.available) {
      return NextResponse.json({
        success: true,
        message: 'SearchAPI.io service is healthy and ready',
        serviceInfo,
        healthCheck,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'SearchAPI.io service is not available',
        serviceInfo,
        healthCheck,
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }

  } catch (error) {
    console.error('❌ SearchAPI.io service test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test SearchAPI.io service',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { googleVideoUrl } = await request.json();
    
    if (!googleVideoUrl) {
      return NextResponse.json({
        success: false,
        error: 'googleVideoUrl parameter is required'
      }, { status: 400 });
    }

    console.log(`🧪 Testing SearchAPI.io download with Google Video URL: ${googleVideoUrl.substring(0, 100)}...`);
    
    // Test download with SearchAPI.io
    const startTime = Date.now();
    const result = await searchApiService.downloadAudio(googleVideoUrl);
    const downloadTime = Date.now() - startTime;
    
    console.log('📊 SearchAPI.io Download Result:', {
      success: result.success,
      error: result.error,
      contentType: result.contentType,
      bufferSize: result.audioBuffer?.byteLength,
      downloadTime,
      credits: result.credits
    });

    if (result.success && result.audioBuffer) {
      const fileSizeMB = (result.audioBuffer.byteLength / 1024 / 1024).toFixed(2);
      
      return NextResponse.json({
        success: true,
        message: 'SearchAPI.io download successful',
        stats: {
          fileSizeMB: parseFloat(fileSizeMB),
          fileSizeBytes: result.audioBuffer.byteLength,
          contentType: result.contentType,
          downloadTimeMs: downloadTime,
          finalUrl: result.finalUrl,
          credits: result.credits
        },
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'SearchAPI.io download failed',
        details: result.error,
        statusCode: result.statusCode,
        contentType: result.contentType
      }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ SearchAPI.io download test error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test SearchAPI.io download',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
