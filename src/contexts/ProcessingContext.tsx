'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ProcessingStage =
  | 'idle'
  | 'downloading'
  | 'extracting'
  | 'beat-detection'
  | 'chord-recognition'
  | 'complete'
  | 'error';

interface ProcessingContextType {
  stage: ProcessingStage;
  progress: number;
  statusMessage: string;
  startTime: number | null;
  elapsedTime: number;
  setStage: (stage: ProcessingStage) => void;
  setProgress: (progress: number) => void;
  setStatusMessage: (message: string) => void;
  reset: () => void;
  startProcessing: () => void;
  completeProcessing: () => void;
  failProcessing: (errorMessage: string) => void;
  getFormattedElapsedTime: () => string;
}

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const useProcessing = () => {
  const context = useContext(ProcessingContext);
  if (context === undefined) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
};

interface ProcessingProviderProps {
  children: ReactNode;
}

export const ProcessingProvider: React.FC<ProcessingProviderProps> = ({ children }) => {
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);

  // Format elapsed time as mm:ss.ms
  const getFormattedElapsedTime = () => {
    const totalSeconds = elapsedTime / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((elapsedTime % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // Start the timer
  const startTimer = () => {
    // Clear any existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }

    // Reset timer state
    const now = Date.now();
    setStartTime(now);
    setElapsedTime(0);

    // Create a new timer interval
    const interval = setInterval(() => {
      if (startTime !== null) {
        setElapsedTime(Date.now() - now);
      }
    }, 10); // Update every 10ms for smooth display

    setTimerInterval(interval);

    console.log('Timer started');
  };

  // Stop the timer and freeze the elapsed time
  const stopTimer = useCallback(() => {
    // Only proceed if there's an active timer
    if (timerInterval) {
      // Clear the interval
      clearInterval(timerInterval);
      setTimerInterval(null);

      // Calculate and freeze the final elapsed time
      if (startTime !== null) {
        const finalElapsedTime = Date.now() - startTime;
        setElapsedTime(finalElapsedTime);
        console.log(`Timer stopped. Final time: ${finalElapsedTime}ms`);
      }

      // Clear the start time to prevent any further updates
      setStartTime(null);
    }
  }, [timerInterval, startTime]);

  const reset = () => {
    stopTimer();
    setStage('idle');
    setProgress(0);
    setStatusMessage('');
    setStartTime(null);
    setElapsedTime(0);
  };

  const startProcessing = () => {
    // Just start the timer without changing the stage
    startTimer();
    // Reset progress
    setProgress(0);
    // Update message to indicate analysis is starting
    setStatusMessage('Starting audio analysis...');
  };

  const completeProcessing = () => {
    // Make sure to stop the timer first
    stopTimer();

    // Then update the UI state
    setStage('complete');
    setProgress(100);
    setStatusMessage('Processing complete');

    console.log('Processing completed, timer stopped');
  };

  const failProcessing = (errorMessage: string) => {
    stopTimer();
    setStage('error');
    setStatusMessage(`Error: ${errorMessage}`);
  };

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        console.log('Timer cleaned up on unmount');
      }
    };
  }, [timerInterval]);

  // Additional effect to ensure timer stops when stage changes to 'complete'
  React.useEffect(() => {
    if (stage === 'complete' && timerInterval) {
      // Clear the interval directly to avoid dependency issues
      clearInterval(timerInterval);
      setTimerInterval(null);

      // Calculate and freeze the final elapsed time
      if (startTime !== null) {
        const finalElapsedTime = Date.now() - startTime;
        setElapsedTime(finalElapsedTime);
        console.log(`Timer stopped due to stage change. Final time: ${finalElapsedTime}ms`);
      }

      // Clear the start time to prevent any further updates
      setStartTime(null);
    }
  }, [stage, timerInterval, startTime]); // Include all dependencies

  return (
    <ProcessingContext.Provider
      value={{
        stage,
        progress,
        statusMessage,
        startTime,
        elapsedTime,
        setStage,
        setProgress,
        setStatusMessage,
        reset,
        startProcessing,
        completeProcessing,
        failProcessing,
        getFormattedElapsedTime,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
};

export default ProcessingContext;
