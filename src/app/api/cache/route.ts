import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

// Dynamic imports to handle potential missing services
async function getCacheServices() {
  try {
    const [cacheService, localCacheService] = await Promise.all([
      import('@/services/cacheService'),
      import('@/services/localCacheService')
    ]);
    return {
      getCacheIndex: cacheService.getCacheIndex,
      cleanCache: cacheService.cleanCache,
      removeCacheEntry: cacheService.removeCacheEntry,
      localCacheService: localCacheService.localCacheService
    };
  } catch (error) {
    console.warn('Cache services not available:', error);
    return null;
  }
}

// GET handler to retrieve cache status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const videoId = searchParams.get('videoId');

    const services = await getCacheServices();
    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Cache services not available'
      }, { status: 503 });
    }

    switch (action) {
      case 'stats':
        // Get both local cache and Firebase cache stats
        let localStats = { cacheEntries: 0, totalSize: 0 };
        try {
          const stats = await services.localCacheService.getCacheStats();
          localStats = {
            cacheEntries: stats.totalEntries || 0,
            totalSize: stats.totalSize || 0
          };
        } catch {
          console.warn('Local cache not available');
        }

        let firebaseStats: { cacheEntries: number; totalSize: number; cacheIndex: unknown[] } = { cacheEntries: 0, totalSize: 0, cacheIndex: [] };
        try {
          const cacheIndex = await services.getCacheIndex();
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

        try {
          const cached = await services.localCacheService.getCachedAudio(videoId);
          return NextResponse.json({
            success: true,
            cached: cached || null
          });
        } catch {
          return NextResponse.json({
            success: false,
            error: 'Failed to get cached audio'
          }, { status: 500 });
        }

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

    const services = await getCacheServices();
    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Cache services not available'
      }, { status: 503 });
    }

    switch (action) {
      case 'clean':
        // Clean cache entries older than maxAge days
        try {
          await services.cleanCache(maxAge || 30);
          return NextResponse.json({
            success: true,
            message: `Cache cleaned (entries older than ${maxAge || 30} days removed)`
          });
        } catch {
          return NextResponse.json({
            success: false,
            error: 'Failed to clean cache'
          }, { status: 500 });
        }
        
      case 'remove':
        // Remove specific video from cache
        if (!videoId) {
          return NextResponse.json(
            { error: 'Missing videoId parameter' },
            { status: 400 }
          );
        }
        try {
          await services.removeCacheEntry(videoId);
          return NextResponse.json({
            success: true,
            message: `Cache entry for ${videoId} removed`
          });
        } catch {
          return NextResponse.json({
            success: false,
            error: 'Failed to remove cache entry'
          }, { status: 500 });
        }
        
      case 'clear':
        // Clear entire cache
        try {
          const cacheIndex = await services.getCacheIndex();

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
          const cacheDir = path.join(process.cwd(), 'cache');
          try {
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(
              path.join(cacheDir, 'cache_index.json'),
              JSON.stringify([])
            );
          } catch (e) {
            console.warn('Failed to clear cache index:', e);
          }

          return NextResponse.json({
            success: true,
            message: 'Cache cleared completely'
          });
        } catch {
          return NextResponse.json({
            success: false,
            error: 'Failed to clear cache'
          }, { status: 500 });
        }
        
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
