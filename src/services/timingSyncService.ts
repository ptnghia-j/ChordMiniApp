/**
 * Timing Synchronization Service
 * 
 * Provides centralized timing management and synchronization between
 * audio playback, lyrics, and chord progression timing.
 */

export interface TimingOffset {
  audioOffset: number;    // Audio playback latency compensation
  lyricsOffset: number;   // Lyrics timing offset from audio
  chordsOffset: number;   // Chord timing offset from audio
}

export interface SyncedTimestamp {
  audioTime: number;      // Raw audio playback time
  syncedTime: number;     // Synchronized time for lyrics/chords
  confidence: number;     // Sync confidence (0-1)
}

class TimingSyncService {
  private offsets: TimingOffset = {
    audioOffset: 0,
    lyricsOffset: 0,
    chordsOffset: 0
  };

  private calibrationData: Array<{
    audioTime: number;
    expectedTime: number;
    actualTime: number;
  }> = [];

  /**
   * Set timing offsets based on calibration or user adjustment
   */
  setOffsets(offsets: Partial<TimingOffset>): void {
    this.offsets = { ...this.offsets, ...offsets };
  }

  /**
   * Get current timing offsets
   */
  getOffsets(): TimingOffset {
    return { ...this.offsets };
  }

  /**
   * Convert raw audio time to synchronized time for lyrics
   */
  audioToLyricsTime(audioTime: number): number {
    return audioTime + this.offsets.lyricsOffset;
  }

  /**
   * Convert raw audio time to synchronized time for chords
   */
  audioToChordsTime(audioTime: number): number {
    return audioTime + this.offsets.chordsOffset;
  }

  /**
   * Normalize timestamp from different sources to a common format
   */
  normalizeTimestamp(timestamp: number | { start?: number; startTime?: number }): number {
    if (typeof timestamp === 'number') {
      return timestamp;
    }
    
    // Handle Music.ai API inconsistent property names
    return timestamp.startTime ?? timestamp.start ?? 0;
  }

  /**
   * Calculate optimal timing offset based on beat detection and lyrics alignment
   */
  calibrateTimingOffset(
    beatTimes: number[],
    lyricsLines: Array<{ startTime: number; endTime: number; text: string }>
  ): TimingOffset {
    // Find lyrics lines that likely align with strong beats (downbeats)
    const strongBeatIndicators = lyricsLines.filter(line => 
      line.text.match(/^(verse|chorus|bridge|intro|outro)/i) ||
      line.text.length < 10 // Short lines often align with beats
    );

    if (strongBeatIndicators.length === 0 || beatTimes.length === 0) {
      return this.offsets;
    }

    // Calculate average offset between beat times and lyrics times
    let totalOffset = 0;
    let validComparisons = 0;

    strongBeatIndicators.forEach(line => {
      // Find closest beat to this lyrics line
      const closestBeat = beatTimes.reduce((closest, beat) => 
        Math.abs(beat - line.startTime) < Math.abs(closest - line.startTime) ? beat : closest
      );

      const offset = closestBeat - line.startTime;
      if (Math.abs(offset) < 2.0) { // Only consider reasonable offsets
        totalOffset += offset;
        validComparisons++;
      }
    });

    if (validComparisons > 0) {
      const averageOffset = totalOffset / validComparisons;
      this.offsets.lyricsOffset = averageOffset;
    }

    return this.offsets;
  }

  /**
   * Add calibration data point for continuous improvement
   */
  addCalibrationPoint(audioTime: number, expectedTime: number, actualTime: number): void {
    this.calibrationData.push({ audioTime, expectedTime, actualTime });
    
    // Keep only recent calibration data (last 50 points)
    if (this.calibrationData.length > 50) {
      this.calibrationData = this.calibrationData.slice(-50);
    }

    // Recalculate offsets if we have enough data
    if (this.calibrationData.length >= 10) {
      this.recalculateOffsets();
    }
  }

  /**
   * Recalculate timing offsets based on calibration data
   */
  private recalculateOffsets(): void {
    if (this.calibrationData.length < 5) return;

    const recentData = this.calibrationData.slice(-20); // Use last 20 points
    const avgOffset = recentData.reduce((sum, point) => 
      sum + (point.expectedTime - point.actualTime), 0
    ) / recentData.length;

    // Apply gradual adjustment to avoid sudden jumps
    this.offsets.lyricsOffset = this.offsets.lyricsOffset * 0.8 + avgOffset * 0.2;
  }

  /**
   * Get synchronized timestamp with confidence score
   */
  getSyncedTimestamp(audioTime: number, type: 'lyrics' | 'chords'): SyncedTimestamp {
    const syncedTime = type === 'lyrics' 
      ? this.audioToLyricsTime(audioTime)
      : this.audioToChordsTime(audioTime);

    // Calculate confidence based on calibration data consistency
    const confidence = this.calculateSyncConfidence();

    return {
      audioTime,
      syncedTime,
      confidence
    };
  }

  /**
   * Calculate synchronization confidence based on calibration data
   */
  private calculateSyncConfidence(): number {
    if (this.calibrationData.length < 5) return 0.5;

    const recentData = this.calibrationData.slice(-10);
    const offsets = recentData.map(point => point.expectedTime - point.actualTime);
    
    // Calculate standard deviation of offsets
    const mean = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
    const variance = offsets.reduce((sum, offset) => sum + Math.pow(offset - mean, 2), 0) / offsets.length;
    const stdDev = Math.sqrt(variance);

    // Convert standard deviation to confidence (lower stdDev = higher confidence)
    return Math.max(0, Math.min(1, 1 - (stdDev / 0.5)));
  }

  /**
   * Reset all timing calibration
   */
  reset(): void {
    this.offsets = {
      audioOffset: 0,
      lyricsOffset: 0,
      chordsOffset: 0
    };
    this.calibrationData = [];
  }
}

// Export singleton instance
export const timingSyncService = new TimingSyncService();
