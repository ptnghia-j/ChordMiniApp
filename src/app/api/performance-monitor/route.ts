/**
 * Performance Monitoring API Endpoint
 * 
 * Provides real-time performance metrics for the deployed fixes:
 * - Firebase query reduction monitoring
 * - QuickTube filename accuracy tracking
 * - Smart caching performance metrics
 * - Error reduction statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor } from '@/services/performance/performanceMonitor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'summary';
    const export_data = searchParams.get('export') === 'true';

    if (export_data) {
      // Export full metrics for external monitoring systems
      const exportData = performanceMonitor.exportMetrics();
      
      return new NextResponse(exportData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="chordmini-performance-${Date.now()}.json"`
        }
      });
    }

    if (format === 'full') {
      // Return full metrics
      const metrics = performanceMonitor.getMetrics();
      
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        metrics
      });
    }

    // Return performance summary (default)
    const summary = performanceMonitor.getPerformanceSummary();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary
    });

  } catch (error) {
    console.error('Performance monitoring API error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve performance metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'set_baseline':
        performanceMonitor.setBaseline(data);
        return NextResponse.json({
          success: true,
          message: 'Baseline metrics set successfully'
        });

      case 'track_firebase':
        const { type, responseTime } = data;
        performanceMonitor.trackFirebaseQuery(type, responseTime);
        return NextResponse.json({
          success: true,
          message: 'Firebase query tracked'
        });

      case 'track_filename':
        const { success, isVietnamese } = data;
        performanceMonitor.trackFilenameMatching(success, isVietnamese);
        return NextResponse.json({
          success: true,
          message: 'Filename matching tracked'
        });

      case 'track_cache':
        const { cacheType, cacheResponseTime } = data;
        performanceMonitor.trackCachePerformance(cacheType, cacheResponseTime);
        return NextResponse.json({
          success: true,
          message: 'Cache performance tracked'
        });

      case 'track_error':
        const { errorType } = data;
        performanceMonitor.trackErrorReduction(errorType);
        return NextResponse.json({
          success: true,
          message: 'Error reduction tracked'
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Performance monitoring POST error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process performance tracking request'
    }, { status: 500 });
  }
}

// Health check endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
