/**
 * Performance Tracking Service
 * Tracks timing metrics for audio processing pipeline comparison
 */

export interface PerformanceMetrics {
  stepName: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessingSession {
  sessionId: string;
  method: 'appwrite' | 'downr-conversion';
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  steps: PerformanceMetrics[];
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class PerformanceTracker {
  private sessions: Map<string, ProcessingSession> = new Map();
  private currentSteps: Map<string, { stepName: string; startTime: number; metadata?: Record<string, unknown> }> = new Map();

  /**
   * Start a new processing session
   */
  startSession(method: 'appwrite' | 'downr-conversion', metadata?: Record<string, unknown>): string {
    const sessionId = `${method}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ProcessingSession = {
      sessionId,
      method,
      startTime: performance.now(),
      steps: [],
      success: false,
      metadata
    };
    
    this.sessions.set(sessionId, session);
    console.log(`🚀 Started ${method} session: ${sessionId}`);
    
    return sessionId;
  }

  /**
   * Start timing a specific step within a session
   */
  startStep(sessionId: string, stepName: string, metadata?: Record<string, unknown>): void {
    const stepKey = `${sessionId}_${stepName}`;
    this.currentSteps.set(stepKey, {
      stepName,
      startTime: performance.now(),
      metadata
    });
    
    console.log(`⏱️ Started step: ${stepName} (Session: ${sessionId})`);
  }

  /**
   * End timing a specific step
   */
  endStep(sessionId: string, stepName: string, success: boolean = true, error?: string, metadata?: Record<string, unknown>): void {
    const stepKey = `${sessionId}_${stepName}`;
    const stepData = this.currentSteps.get(stepKey);
    
    if (!stepData) {
      console.warn(`⚠️ No step data found for: ${stepName} in session ${sessionId}`);
      return;
    }
    
    const endTime = performance.now();
    const duration = endTime - stepData.startTime;
    
    const metric: PerformanceMetrics = {
      stepName,
      startTime: stepData.startTime,
      endTime,
      duration,
      success,
      error,
      metadata: { ...stepData.metadata, ...metadata }
    };
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.steps.push(metric);
    }
    
    this.currentSteps.delete(stepKey);
    
    const status = success ? '✅' : '❌';
    console.log(`${status} Completed step: ${stepName} (${duration.toFixed(2)}ms)`);
  }

  /**
   * End a processing session
   */
  endSession(sessionId: string, success: boolean = true, error?: string, metadata?: Record<string, unknown>): ProcessingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`⚠️ No session found: ${sessionId}`);
      return null;
    }
    
    session.endTime = performance.now();
    session.totalDuration = session.endTime - session.startTime;
    session.success = success;
    session.error = error;
    session.metadata = { ...session.metadata, ...metadata };
    
    const status = success ? '✅' : '❌';
    console.log(`${status} Completed ${session.method} session: ${sessionId} (${session.totalDuration.toFixed(2)}ms)`);
    
    return session;
  }

  /**
   * Get session data
   */
  getSession(sessionId: string): ProcessingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ProcessingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Compare two sessions
   */
  compareSessions(sessionId1: string, sessionId2: string): {
    session1: ProcessingSession | null;
    session2: ProcessingSession | null;
    comparison: {
      fasterMethod: string;
      timeDifference: number;
      percentageDifference: number;
      stepComparison: Array<{
        stepName: string;
        session1Duration: number;
        session2Duration: number;
        difference: number;
      }>;
    } | null;
  } {
    const session1 = this.getSession(sessionId1);
    const session2 = this.getSession(sessionId2);
    
    if (!session1 || !session2 || !session1.totalDuration || !session2.totalDuration) {
      return { session1, session2, comparison: null };
    }
    
    const timeDifference = Math.abs(session1.totalDuration - session2.totalDuration);
    const fasterSession = session1.totalDuration < session2.totalDuration ? session1 : session2;
    const slowerDuration = Math.max(session1.totalDuration, session2.totalDuration);
    const percentageDifference = (timeDifference / slowerDuration) * 100;
    
    // Compare steps
    const stepComparison: Array<{
      stepName: string;
      session1Duration: number;
      session2Duration: number;
      difference: number;
    }> = [];
    
    const allStepNames = new Set([
      ...session1.steps.map(s => s.stepName),
      ...session2.steps.map(s => s.stepName)
    ]);
    
    allStepNames.forEach(stepName => {
      const step1 = session1.steps.find(s => s.stepName === stepName);
      const step2 = session2.steps.find(s => s.stepName === stepName);
      
      stepComparison.push({
        stepName,
        session1Duration: step1?.duration || 0,
        session2Duration: step2?.duration || 0,
        difference: (step1?.duration || 0) - (step2?.duration || 0)
      });
    });
    
    return {
      session1,
      session2,
      comparison: {
        fasterMethod: fasterSession.method,
        timeDifference,
        percentageDifference,
        stepComparison
      }
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    totalSessions: number;
    appwriteSessions: ProcessingSession[];
    downrSessions: ProcessingSession[];
    averageTimings: {
      appwrite: number;
      downrConversion: number;
    };
    successRates: {
      appwrite: number;
      downrConversion: number;
    };
  } {
    const allSessions = this.getAllSessions();
    const appwriteSessions = allSessions.filter(s => s.method === 'appwrite');
    const downrSessions = allSessions.filter(s => s.method === 'downr-conversion');
    
    const calculateAverage = (sessions: ProcessingSession[]) => {
      const completedSessions = sessions.filter(s => s.totalDuration);
      if (completedSessions.length === 0) return 0;
      return completedSessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / completedSessions.length;
    };
    
    const calculateSuccessRate = (sessions: ProcessingSession[]) => {
      if (sessions.length === 0) return 0;
      return (sessions.filter(s => s.success).length / sessions.length) * 100;
    };
    
    return {
      totalSessions: allSessions.length,
      appwriteSessions,
      downrSessions,
      averageTimings: {
        appwrite: calculateAverage(appwriteSessions),
        downrConversion: calculateAverage(downrSessions)
      },
      successRates: {
        appwrite: calculateSuccessRate(appwriteSessions),
        downrConversion: calculateSuccessRate(downrSessions)
      }
    };
  }

  /**
   * Clear all session data
   */
  clearSessions(): void {
    this.sessions.clear();
    this.currentSteps.clear();
    console.log('🧹 Cleared all performance tracking data');
  }

  /**
   * Export session data for analysis
   */
  exportData(): string {
    const data = {
      timestamp: new Date().toISOString(),
      sessions: Array.from(this.sessions.values()),
      report: this.generateReport()
    };
    
    return JSON.stringify(data, null, 2);
  }
}

// Global instance
export const performanceTracker = new PerformanceTracker();
