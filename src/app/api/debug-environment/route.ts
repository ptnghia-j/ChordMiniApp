import { NextRequest, NextResponse } from 'next/server';
import { detectEnvironment, getAudioProcessingStrategy, shouldUseYtMp3Go } from '@/utils/environmentDetection';

/**
 * Debug Environment Detection API
 * 
 * This endpoint helps diagnose environment detection issues
 * and verifies which audio extraction service should be used.
 */

export async function GET() {
  try {
    // Get environment detection results
    const env = detectEnvironment();
    const strategy = getAudioProcessingStrategy();
    const shouldUseYtMp3GoResult = shouldUseYtMp3Go();

    // Get all relevant environment variables
    const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      NEXT_PUBLIC_AUDIO_STRATEGY: process.env.NEXT_PUBLIC_AUDIO_STRATEGY,
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
    };

    // Manual environment checks
    const manualChecks = {
      isVercelCheck1: process.env.VERCEL === '1',
      isVercelCheck2: !!process.env.VERCEL,
      isVercelCheck3: !!process.env.VERCEL_ENV,
      isVercelCheck4: !!process.env.VERCEL_URL,
      isProductionCheck: process.env.NODE_ENV === 'production',
      combinedVercelProd: process.env.VERCEL === '1' && process.env.NODE_ENV === 'production'
    };

    // Service selection logic
    const serviceSelection = {
      detectedStrategy: strategy,
      shouldUseYtMp3Go: shouldUseYtMp3GoResult,
      expectedService: strategy === 'ytmp3go' ? 'yt-mp3-go' : 
                      strategy === 'ytdlp' ? 'yt-dlp' : 'QuickTube',
      isVercelProduction: env.isVercel && env.isProduction
    };

    // Configuration details
    const config = {
      environment: env,
      strategy: strategy,
      endpoints: {
        ytmp3go: 'https://lukavukanovic.xyz/yt-downloader',
        quicktube: 'https://quicktube.app',
        ytdlp: `${env.baseUrl}/api/ytdlp`
      }
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environmentVariables: envVars,
      environmentDetection: env,
      manualChecks,
      serviceSelection,
      configuration: config,
      summary: {
        currentEnvironment: env.isVercel ? 'Vercel' : env.isDevelopment ? 'Development' : 'Unknown',
        selectedService: serviceSelection.expectedService,
        isCorrectlyConfigured: strategy === 'ytmp3go' ? env.isVercel && env.isProduction : true,
        recommendations: strategy === 'ytmp3go' && (!env.isVercel || !env.isProduction) ? 
          ['Environment detection may be incorrect', 'Check VERCEL and NODE_ENV variables'] : 
          ['Environment detection appears correct']
      }
    });

  } catch (error) {
    console.error('❌ Environment debug error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { testStrategy } = data;

    if (!testStrategy) {
      return NextResponse.json({
        success: false,
        error: 'Missing testStrategy in request body'
      }, { status: 400 });
    }

    // Test strategy without modifying environment
    // Note: We can't modify process.env in production builds, so we'll simulate the result
    const simulatedEnv = {
      ...process.env,
      NEXT_PUBLIC_AUDIO_STRATEGY: testStrategy
    } as Record<string, string | undefined>;

    // Simulate what the environment detection would return
    let simulatedStrategy = testStrategy;
    if (testStrategy === 'auto') {
      // Use the same logic as detectEnvironment
      const isVercel = !!(simulatedEnv.VERCEL_ENV || simulatedEnv.VERCEL_URL || simulatedEnv.VERCEL);
      const isProduction = simulatedEnv.NODE_ENV === 'production' || isVercel;

      if (isProduction && isVercel) {
        simulatedStrategy = 'ytmp3go';
      } else if (simulatedEnv.NODE_ENV === 'development') {
        simulatedStrategy = 'ytdlp';
      } else {
        simulatedStrategy = 'quicktube';
      }
    }

    return NextResponse.json({
      success: true,
      testStrategy,
      result: {
        detectedStrategy: simulatedStrategy,
        simulatedEnvironment: {
          isVercel: !!(simulatedEnv.VERCEL_ENV || simulatedEnv.VERCEL_URL || simulatedEnv.VERCEL),
          isProduction: simulatedEnv.NODE_ENV === 'production',
          strategy: simulatedStrategy
        },
        serviceWouldUse: simulatedStrategy === 'ytmp3go' ? 'yt-mp3-go' :
                        simulatedStrategy === 'ytdlp' ? 'yt-dlp' : 'QuickTube'
      }
    });

  } catch (error) {
    console.error('❌ Environment test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
