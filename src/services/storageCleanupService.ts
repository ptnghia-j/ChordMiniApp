/**
 * Storage Cleanup Service for ChordMiniApp
 * 
 * Handles automatic cleanup of expired stream URLs, orphaned storage files,
 * and maintenance of the Firebase Storage and Firestore systems.
 */

import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject, listAll, getMetadata } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { storageMonitoringService } from './storageMonitoringService';

export interface CleanupResult {
  expiredUrlsRemoved: number;
  orphanedFilesRemoved: number;
  storageSpaceFreed: number; // in bytes
  errors: string[];
  duration: number; // in milliseconds
}

export interface CleanupOptions {
  removeExpiredUrls: boolean;
  removeOrphanedFiles: boolean;
  dryRun: boolean; // If true, only report what would be cleaned without actually deleting
  maxAge: number; // Maximum age in days for files to be considered for cleanup
}

export class StorageCleanupService {
  private static instance: StorageCleanupService;

  public static getInstance(): StorageCleanupService {
    if (!StorageCleanupService.instance) {
      StorageCleanupService.instance = new StorageCleanupService();
    }
    return StorageCleanupService.instance;
  }

  /**
   * Run comprehensive cleanup with specified options
   */
  async runCleanup(options: CleanupOptions = {
    removeExpiredUrls: true,
    removeOrphanedFiles: false, // Conservative default
    dryRun: false,
    maxAge: 30 // 30 days
  }): Promise<CleanupResult> {
    const startTime = Date.now();

    const result: CleanupResult = {
      expiredUrlsRemoved: 0,
      orphanedFilesRemoved: 0,
      storageSpaceFreed: 0,
      errors: [],
      duration: 0
    };

    try {
      // Step 1: Clean up expired stream URLs
      if (options.removeExpiredUrls) {
        const expiredResult = await this.cleanupExpiredStreamUrls(options.dryRun);
        result.expiredUrlsRemoved = expiredResult.count;
        result.errors.push(...expiredResult.errors);

      }

      // Step 2: Clean up orphaned storage files (if enabled)
      if (options.removeOrphanedFiles) {
        const orphanedResult = await this.cleanupOrphanedStorageFiles(options.dryRun, options.maxAge);
        result.orphanedFilesRemoved = orphanedResult.count;
        result.storageSpaceFreed = orphanedResult.spaceFreed;
        result.errors.push(...orphanedResult.errors);
        console.log(`🧹 Orphaned files cleanup: ${orphanedResult.count} removed, ${(orphanedResult.spaceFreed / 1024 / 1024).toFixed(2)}MB freed`);
      }

      // Step 3: Clean up duplicate entries
      const duplicateResult = await this.cleanupDuplicateEntries(options.dryRun);
      result.errors.push(...duplicateResult.errors);
      console.log(`🧹 Duplicate entries cleanup: ${duplicateResult.count} removed`);

    } catch (error) {
      const errorMessage = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMessage);
      console.error('❌ Cleanup error:', error);
    }

    result.duration = Date.now() - startTime;
    console.log(`🧹 Cleanup completed in ${result.duration}ms`);

    // Log cleanup results for monitoring
    storageMonitoringService.logStorageOperation({
      type: 'cache_hit', // Using existing type for cleanup logging
      videoId: 'cleanup_operation',
      success: result.errors.length === 0,
      error: result.errors.join('; ')
    });

    return result;
  }

  /**
   * Clean up expired QuickTube stream URLs from Firestore
   */
  private async cleanupExpiredStreamUrls(dryRun: boolean): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      if (!db) {
        errors.push('Firebase not initialized');
        return { count, errors };
      }

      const now = Date.now();

      // Query for expired stream URLs
      const audioFilesQuery = query(
        collection(db, 'audioFiles'),
        where('isStreamUrl', '==', true),
        where('streamExpiresAt', '<', now)
      );

      const snapshot = await getDocs(audioFilesQuery);

      for (const docSnapshot of snapshot.docs) {
        try {
          if (!dryRun) {
            await deleteDoc(doc(db, 'audioFiles', docSnapshot.id));
          }
          count++;

        } catch (error) {
          const errorMessage = `Failed to delete expired URL ${docSnapshot.id}: ${error}`;
          errors.push(errorMessage);
          console.error('❌', errorMessage);
        }
      }

    } catch (error) {
      const errorMessage = `Failed to query expired URLs: ${error}`;
      errors.push(errorMessage);
      console.error('❌', errorMessage);
    }

    return { count, errors };
  }

  /**
   * Clean up orphaned storage files that have no corresponding Firestore entry
   */
  private async cleanupOrphanedStorageFiles(dryRun: boolean, maxAgeDays: number): Promise<{ count: number; spaceFreed: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;
    let spaceFreed = 0;

    try {
      if (!storage || !db) {
        errors.push('Firebase Storage or Firestore not initialized');
        return { count, spaceFreed, errors };
      }

      // List all files in Firebase Storage
      const audioRef = ref(storage, 'audio');
      const storageList = await listAll(audioRef);

      // Get all Firestore entries for comparison
      const firestoreEntries = new Set<string>();
      const audioFilesSnapshot = await getDocs(collection(db, 'audioFiles'));

      audioFilesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.storagePath) {
          firestoreEntries.add(data.storagePath);
        }
      });

      // Check each storage file
      for (const item of storageList.items) {
        try {
          const storagePath = item.fullPath;
          
          // Check if this file has a corresponding Firestore entry
          if (!firestoreEntries.has(storagePath)) {
            // Get file metadata to check age
            const metadata = await getMetadata(item);
            const fileAge = Date.now() - new Date(metadata.timeCreated).getTime();
            const ageInDays = fileAge / (1000 * 60 * 60 * 24);

            if (ageInDays > maxAgeDays) {
              const fileSize = metadata.size || 0;
              
              if (!dryRun) {
                await deleteObject(item);
              }
              
              count++;
              spaceFreed += fileSize;
              // File removed silently
            }
          }
        } catch (error) {
          const errorMessage = `Failed to process storage file ${item.fullPath}: ${error}`;
          errors.push(errorMessage);
          console.error('❌', errorMessage);
        }
      }

    } catch (error) {
      const errorMessage = `Failed to cleanup orphaned files: ${error}`;
      errors.push(errorMessage);
      console.error('❌', errorMessage);
    }

    return { count, spaceFreed, errors };
  }

  /**
   * Clean up duplicate Firestore entries for the same video ID
   */
  private async cleanupDuplicateEntries(dryRun: boolean): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      if (!db) {
        errors.push('Firebase not initialized');
        return { count, errors };
      }

      const audioFilesSnapshot = await getDocs(collection(db, 'audioFiles'));
      const videoIdMap = new Map<string, Array<{ id: string; data: Record<string, unknown>; createdAt: Date }>>();

      // Group documents by videoId
      audioFilesSnapshot.forEach((doc) => {
        const data = doc.data();
        const videoId = data.videoId;
        
        if (!videoIdMap.has(videoId)) {
          videoIdMap.set(videoId, []);
        }
        
        videoIdMap.get(videoId)!.push({
          id: doc.id,
          data,
          createdAt: data.createdAt?.toDate() || new Date(0)
        });
      });

      // Find and remove duplicates (keep the most recent)
      for (const [videoId, docs] of videoIdMap.entries()) {
        if (docs.length > 1) {
          // Sort by creation date, keep the most recent
          docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          
          // Remove all but the first (most recent)
          for (let i = 1; i < docs.length; i++) {
            try {
              if (!dryRun) {
                await deleteDoc(doc(db, 'audioFiles', docs[i].id));
              }
              count++;
              console.log(`🗑️ ${dryRun ? '[DRY RUN] Would remove' : 'Removed'} duplicate entry for ${videoId}: ${docs[i].id}`);
            } catch (error) {
              const errorMessage = `Failed to delete duplicate ${docs[i].id}: ${error}`;
              errors.push(errorMessage);
              console.error('❌', errorMessage);
            }
          }
        }
      }

    } catch (error) {
      const errorMessage = `Failed to cleanup duplicates: ${error}`;
      errors.push(errorMessage);
      console.error('❌', errorMessage);
    }

    return { count, errors };
  }

  /**
   * Schedule automatic cleanup (would typically be called by a cron job or scheduled function)
   */
  async scheduleCleanup(): Promise<void> {
    console.log('⏰ Running scheduled cleanup...');
    
    const result = await this.runCleanup({
      removeExpiredUrls: true,
      removeOrphanedFiles: false, // Conservative for scheduled runs
      dryRun: false,
      maxAge: 7 // Only remove very old orphaned files
    });

    console.log('⏰ Scheduled cleanup completed:', result);
  }

  /**
   * Get cleanup recommendations based on current storage state
   */
  async getCleanupRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      if (!db) {
        return recommendations;
      }

      // Check for expired URLs
      const expiredQuery = query(
        collection(db, 'audioFiles'),
        where('isStreamUrl', '==', true),
        where('streamExpiresAt', '<', Date.now())
      );
      const expiredSnapshot = await getDocs(expiredQuery);

      if (expiredSnapshot.size > 0) {
        recommendations.push(`Remove ${expiredSnapshot.size} expired stream URLs to clean up database`);
      }

      // Check storage metrics
      const metrics = await storageMonitoringService.getStorageMetrics();
      
      if (metrics.totalStreamUrls > metrics.storageFiles) {
        recommendations.push('Consider migrating more files to Firebase Storage for better reliability');
      }

      if (metrics.estimatedMonthlyCost > 5) {
        recommendations.push('Storage costs are increasing - consider implementing file compression or cleanup');
      }

    } catch (error) {
      console.error('❌ Error generating cleanup recommendations:', error);
    }

    return recommendations;
  }
}

export const storageCleanupService = StorageCleanupService.getInstance();
