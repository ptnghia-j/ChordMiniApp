'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global error boundary component to catch and handle errors
 */
class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to the console
    console.error('Error caught by GlobalErrorBoundary:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-md">
          <h2 className="text-xl font-bold text-red-700 dark:text-red-200 mb-2">Something went wrong</h2>
          <p className="text-red-600 dark:text-red-200 mb-4">
            An error occurred in the application. Please try refreshing the page.
          </p>
          {this.state.error && (
            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-red-100 dark:border-red-700 mb-3">
              <p className="font-mono text-sm text-red-800 dark:text-red-200">{this.state.error.toString()}</p>
            </div>
          )}
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    // If no error, render children normally
    return this.props.children;
  }
}

export default GlobalErrorBoundary;
