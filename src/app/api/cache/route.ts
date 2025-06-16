import { NextRequest, NextResponse } from 'next/server';
import {
  getCacheIndex,
  cleanCache,
  removeCacheEntry
} from '@/services/cacheService';
import { localCacheService } from '@/services/localCacheService';
import { promises as fs } from 'fs';
import path from 'path';

// GET handler to retrieve cache status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const videoId = searchParams.get('videoId');

    switch (action) {
      case 'stats':
        // Get both local cache and Firebase cache stats
        const localStats = await localCacheService.getCacheStats();

        let firebaseStats = { cacheEntries: 0, totalSize: 0, cacheIndex: [] };
        try {
          const cacheIndex = await getCacheIndex();
          let totalSize = 0;
          for (const entry of cacheIndex) {
            if (entry.fileSize && typeof entry.fileSize === 'number') {
              totalSize += entry.fileSize;
            }
          }
          firebaseStats = {
            cacheEntries: cacheIndex.length,
            totalSize,
            cacheIndex
          };
        } catch (firebaseError) {
          console.warn('Firebase cache not available:', firebaseError);
        }

        return NextResponse.json({
          success: true,
          local: localStats,
          firebase: firebaseStats
        });

      case 'get':
        if (!videoId) {
          return NextResponse.json(
            { error: 'videoId required for get action' },
            { status: 400 }
          );
        }

        const cached = await localCacheService.getCachedAudio(videoId);
        return NextResponse.json({
          success: true,
          cached: cached || null
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: stats, get' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Failed to get cache status:', error);
    return NextResponse.json(
      { error: 'Failed to get cache status' },
      { status: 500 }
    );
  }
}

// POST handler to manage cache
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action, videoId, maxAge } = data;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'clean':
        // Clean cache entries older than maxAge days
        await cleanCache(maxAge || 30);
        return NextResponse.json({
          success: true,
          message: `Cache cleaned (entries older than ${maxAge || 30} days removed)`
        });
        
      case 'remove':
        // Remove specific video from cache
        if (!videoId) {
          return NextResponse.json(
            { error: 'Missing videoId parameter' },
            { status: 400 }
          );
        }
        await removeCacheEntry(videoId);
        return NextResponse.json({
          success: true,
          message: `Cache entry for ${videoId} removed`
        });
        
      case 'clear':
        // Clear entire cache
        const cacheIndex = await getCacheIndex();
        
        // Remove all files
        for (const entry of cacheIndex) {
          if (entry.audioUrl && typeof entry.audioUrl === 'string') {
            try {
              const audioPath = path.join(process.cwd(), 'public', entry.audioUrl);
              await fs.unlink(audioPath);
            } catch (e) {
              console.error(`Failed to delete audio file for ${entry.videoId}:`, e);
            }
          }
          
          if (entry.videoUrl && typeof entry.videoUrl === 'string') {
            try {
              const videoPath = path.join(process.cwd(), 'public', entry.videoUrl);
              await fs.unlink(videoPath);
            } catch (e) {
              console.error(`Failed to delete video file for ${entry.videoId}:`, e);
            }
          }
        }
        
        // Clear cache index
        await fs.writeFile(
          path.join(process.cwd(), 'cache', 'cache_index.json'), 
          JSON.stringify([])
        );
        
        return NextResponse.json({
          success: true,
          message: 'Cache cleared completely'
        });
        
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Failed to manage cache:', error);
    return NextResponse.json(
      { error: 'Failed to manage cache' },
      { status: 500 }
    );
  }
}
