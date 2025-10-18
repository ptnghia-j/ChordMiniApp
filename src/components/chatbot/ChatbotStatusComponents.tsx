'use client';

import React from 'react';

/**
 * Loading spinner component for chatbot messages
 */
export const LoadingSpinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center gap-2">
    <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    <span>{message}</span>
  </div>
);

/**
 * Success checkmark component for chatbot messages
 */
export const SuccessIcon: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center gap-2 mb-2">
    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>{message}</span>
  </div>
);

/**
 * Error warning component for chatbot messages
 */
export const ErrorIcon: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-center gap-2 mb-2">
    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
    <span>{message}</span>
  </div>
);
