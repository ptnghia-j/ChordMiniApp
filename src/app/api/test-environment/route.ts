import { NextResponse } from 'next/server';
import { detectEnvironment, logEnvironmentConfig } from '@/utils/environmentDetection';

export async function GET() {
  try {
    // Log environment configuration
    logEnvironmentConfig();
    
    const env = detectEnvironment();
    
    return NextResponse.json({
      success: true,
      environment: env,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
      vercel: process.env.VERCEL,
      port: process.env.PORT,
      manualStrategy: process.env.NEXT_PUBLIC_AUDIO_STRATEGY
    });
  } catch (error) {
    console.error('Environment test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
