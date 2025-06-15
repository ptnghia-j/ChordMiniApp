/**
 * Utility functions for error handling
 */

/**
 * Safely handle API requests with proper error handling
 * @param apiCall - The API call function to execute
 * @param fallbackData - Optional fallback data to return if the API call fails
 * @returns The result of the API call or the fallback data
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  fallbackData?: T
): Promise<{ data: T | undefined; error: string | null }> {
  try {
    const data = await apiCall();
    return { data, error: null };
  } catch (error) {
    console.error('API call failed:', error);
    return {
      data: fallbackData,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Log errors to the console with additional context
 * @param message - The error message
 * @param error - The error object
 * @param context - Additional context information
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(
    `[ERROR] ${message}`,
    error instanceof Error ? error : 'Unknown error',
    context || {}
  );
}

/**
 * Format error messages for display
 * @param error - The error object or message
 * @returns A formatted error message string
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unknown error occurred';
}

/**
 * Create a user-friendly error message from API errors
 * @param error - The error object
 * @returns A user-friendly error message
 */
export function createUserFriendlyErrorMessage(error: unknown): string {
  const errorMessage = formatErrorMessage(error);
  
  // Check for common error patterns and provide more helpful messages
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network Error')) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  
  if (errorMessage.includes('404')) {
    return 'The requested resource was not found. Please try again later.';
  }
  
  if (errorMessage.includes('500')) {
    return 'The server encountered an error. Please try again later.';
  }
  
  return errorMessage;
}
