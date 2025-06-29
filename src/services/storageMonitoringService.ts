/**
 * Storage Monitoring Service for ChordMiniApp
 * 
 * Tracks Firebase Storage usage, costs, performance metrics, and cache analytics
 * for the audio file storage system migration.
 */

import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface StorageMetrics {
  totalFiles: number;
  totalStorageSize: number; // in bytes
  totalStreamUrls: number;
  storageFiles: number;
  averageFileSize: number;
  estimatedMonthlyCost: number;
  cacheHitRate: number;
  uploadSuccessRate: number;
}

export interface PerformanceMetrics {
  averageUploadTime: number;
  averageDownloadTime: number;
  failureRate: number;
  lastUpdated: Date;
}

export interface CacheAnalytics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  storageHits: number;
  streamHits: number;
  expiredUrls: number;
}

export class StorageMonitoringService {
  private static instance: StorageMonitoringService;
  private metricsCache: StorageMetrics | null = null;
  private lastMetricsUpdate: Date | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Firebase Storage pricing (as of 2024)
  private readonly STORAGE_COST_PER_GB_MONTH = 0.026; // $0.026 per GB per month
  private readonly DOWNLOAD_COST_PER_GB = 0.12; // $0.12 per GB downloaded

  public static getInstance(): StorageMonitoringService {
    if (!StorageMonitoringService.instance) {
      StorageMonitoringService.instance = new StorageMonitoringService();
    }
    return StorageMonitoringService.instance;
  }

  /**
   * Get comprehensive storage metrics
   */
  async getStorageMetrics(): Promise<StorageMetrics> {
    // Return cached metrics if still valid
    if (this.metricsCache && this.lastMetricsUpdate && 
        Date.now() - this.lastMetricsUpdate.getTime() < this.CACHE_DURATION) {
      return this.metricsCache;
    }

    console.log('📊 Calculating storage metrics...');

    try {
      if (!db) {
        console.warn('Firebase not initialized');
        return {
          totalFiles: 0,
          totalStorageSize: 0,
          totalStreamUrls: 0,
          storageFiles: 0,
          averageFileSize: 0,
          estimatedMonthlyCost: 0,
          cacheHitRate: 0,
          uploadSuccessRate: 0
        };
      }

      // Query audioFiles collection for storage files
      const audioFilesQuery = query(collection(db, 'audioFiles'));
      const audioFilesSnapshot = await getDocs(audioFilesQuery);

      let totalFiles = 0;
      let totalStorageSize = 0;
      let storageFiles = 0;
      let totalStreamUrls = 0;
      let totalFileSize = 0;

      audioFilesSnapshot.forEach((doc) => {
        const data = doc.data();
        totalFiles++;
        
        if (data.fileSize) {
          totalFileSize += data.fileSize;
        }

        if (data.isStreamUrl === false && data.storagePath) {
          // This is a Firebase Storage file
          storageFiles++;
          totalStorageSize += data.fileSize || 0;
        } else {
          // This is a stream URL
          totalStreamUrls++;
        }
      });

      // Calculate metrics
      const averageFileSize = totalFiles > 0 ? totalFileSize / totalFiles : 0;
      const storageGB = totalStorageSize / (1024 * 1024 * 1024);
      const estimatedMonthlyCost = storageGB * this.STORAGE_COST_PER_GB_MONTH;

      // Calculate cache hit rate (simplified - would need request tracking for accuracy)
      const cacheHitRate = totalFiles > 0 ? (storageFiles / totalFiles) * 100 : 0;

      // Calculate upload success rate (simplified)
      const uploadSuccessRate = totalFiles > 0 ? (storageFiles / totalFiles) * 100 : 0;

      this.metricsCache = {
        totalFiles,
        totalStorageSize,
        totalStreamUrls,
        storageFiles,
        averageFileSize,
        estimatedMonthlyCost,
        cacheHitRate,
        uploadSuccessRate
      };

      this.lastMetricsUpdate = new Date();

      console.log('📊 Storage Metrics Updated:', this.metricsCache);
      return this.metricsCache;

    } catch (error) {
      console.error('❌ Error calculating storage metrics:', error);
      
      // Return default metrics on error
      return {
        totalFiles: 0,
        totalStorageSize: 0,
        totalStreamUrls: 0,
        storageFiles: 0,
        averageFileSize: 0,
        estimatedMonthlyCost: 0,
        cacheHitRate: 0,
        uploadSuccessRate: 0
      };
    }
  }

  /**
   * Log storage operation for monitoring
   */
  logStorageOperation(operation: {
    type: 'upload' | 'download' | 'cache_hit' | 'cache_miss';
    videoId: string;
    fileSize?: number;
    duration?: number;
    success: boolean;
    error?: string;
  }): void {
    const logMessage = `📈 Storage Operation: ${operation.type} | ${operation.videoId} | ${operation.success ? 'SUCCESS' : 'FAILED'}`;

    if (operation.fileSize) {
      console.log(`${logMessage} | ${(operation.fileSize / 1024 / 1024).toFixed(2)}MB`);
    } else {
      console.log(logMessage);
    }

    if (!operation.success && operation.error) {
      console.error(`❌ Storage Error: ${operation.error}`);
    }

    // In a production system, you might want to send these metrics to a monitoring service
    // like Google Analytics, Mixpanel, or a custom metrics endpoint
  }

  /**
   * Get storage cost estimate
   */
  async getStorageCostEstimate(): Promise<{
    currentMonthly: number;
    projectedAnnual: number;
    breakdown: {
      storage: number;
      bandwidth: number;
    };
  }> {
    const metrics = await this.getStorageMetrics();
    const storageGB = metrics.totalStorageSize / (1024 * 1024 * 1024);
    
    // Estimate bandwidth usage (assume each file downloaded once per month)
    const estimatedBandwidthGB = storageGB; // Conservative estimate
    
    const storageCost = storageGB * this.STORAGE_COST_PER_GB_MONTH;
    const bandwidthCost = estimatedBandwidthGB * this.DOWNLOAD_COST_PER_GB;
    const totalMonthly = storageCost + bandwidthCost;

    return {
      currentMonthly: totalMonthly,
      projectedAnnual: totalMonthly * 12,
      breakdown: {
        storage: storageCost,
        bandwidth: bandwidthCost
      }
    };
  }

  /**
   * Get cache analytics
   */
  async getCacheAnalytics(): Promise<CacheAnalytics> {
    // This would typically track actual request patterns
    // For now, we'll derive from stored data
    const metrics = await this.getStorageMetrics();
    
    return {
      totalRequests: metrics.totalFiles,
      cacheHits: metrics.storageFiles,
      cacheMisses: metrics.totalStreamUrls,
      storageHits: metrics.storageFiles,
      streamHits: metrics.totalStreamUrls,
      expiredUrls: 0 // Would need to check expiration timestamps
    };
  }

  /**
   * Generate storage report
   */
  async generateStorageReport(): Promise<string> {
    const metrics = await this.getStorageMetrics();
    const costs = await this.getStorageCostEstimate();

    return `
📊 ChordMiniApp Storage Report
Generated: ${new Date().toISOString()}

🗄️ Storage Overview:
- Total Files: ${metrics.totalFiles}
- Firebase Storage Files: ${metrics.storageFiles}
- Stream URL References: ${metrics.totalStreamUrls}
- Total Storage Size: ${(metrics.totalStorageSize / 1024 / 1024).toFixed(2)} MB
- Average File Size: ${(metrics.averageFileSize / 1024 / 1024).toFixed(2)} MB

💰 Cost Analysis:
- Current Monthly: $${costs.currentMonthly.toFixed(2)}
- Projected Annual: $${costs.projectedAnnual.toFixed(2)}
- Storage Cost: $${costs.breakdown.storage.toFixed(2)}/month
- Bandwidth Cost: $${costs.breakdown.bandwidth.toFixed(2)}/month

📈 Performance Metrics:
- Cache Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%
- Upload Success Rate: ${metrics.uploadSuccessRate.toFixed(1)}%
- Storage vs Stream Ratio: ${metrics.storageFiles}:${metrics.totalStreamUrls}

🎯 Recommendations:
${this.generateRecommendations(metrics, costs)}
    `.trim();
  }

  private generateRecommendations(metrics: StorageMetrics, costs: { currentMonthly: number; projectedAnnual: number; breakdown: { storage: number; bandwidth: number } }): string {
    const recommendations: string[] = [];

    if (metrics.uploadSuccessRate < 90) {
      recommendations.push('- Investigate upload failures and improve error handling');
    }

    if (costs.currentMonthly > 10) {
      recommendations.push('- Consider implementing file cleanup for old/unused files');
    }

    if (metrics.totalStreamUrls > metrics.storageFiles) {
      recommendations.push('- Increase Firebase Storage upload success rate to reduce stream URL dependency');
    }

    if (metrics.averageFileSize > 5 * 1024 * 1024) {
      recommendations.push('- Consider audio compression to reduce storage costs');
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '- System is operating efficiently';
  }
}

export const storageMonitoringService = StorageMonitoringService.getInstance();
