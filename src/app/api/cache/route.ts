import { NextRequest, NextResponse } from 'next/server';
import { 
  getCacheIndex, 
  cleanCache, 
  removeCacheEntry,
  CacheEntry
} from '@/services/cacheService';
import { promises as fs } from 'fs';
import path from 'path';

// GET handler to retrieve cache status
export async function GET(request: NextRequest) {
  try {
    const cacheIndex = await getCacheIndex();
    
    // Calculate total size
    let totalSize = 0;
    for (const entry of cacheIndex) {
      if (entry.fileSize) {
        totalSize += entry.fileSize;
      }
    }
    
    return NextResponse.json({
      success: true,
      cacheEntries: cacheIndex.length,
      totalSize,
      cacheIndex
    });
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
          if (entry.audioUrl) {
            try {
              const audioPath = path.join(process.cwd(), 'public', entry.audioUrl);
              await fs.unlink(audioPath);
            } catch (e) {
              console.error(`Failed to delete audio file for ${entry.videoId}:`, e);
            }
          }
          
          if (entry.videoUrl) {
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
