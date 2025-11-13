/**
 * Exponential Backoff Retry Logic
 * Automatically retries failed requests with exponential backoff
 */

import { logger } from './logger'

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  shouldRetry: (error: Error) => {
    // Retry on network errors, 5xx server errors, or Supabase specific errors
    const message = error.message.toLowerCase();
    
    // Check for Supabase/PostgreSQL error codes
    const errorObj = error as { code?: string; status?: number }
    if (errorObj.code) {
      const retryableCodes = [
        'PGRST504', // Gateway timeout
        'PGRST503', // Service unavailable
        '57014', // Query cancelled
        '53300', // Too many connections
        '08006', // Connection failure
      ]
      if (retryableCodes.includes(errorObj.code)) return true
    }
    
    // Check for HTTP 5xx status codes
    if (errorObj.status && errorObj.status >= 500 && errorObj.status < 600) {
      return true
    }
    
    // Check error message for common transient issues
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('rate limit')
    );
  },
  onRetry: (error: Error, attempt: number) => {
    logger.warn(`Retry attempt ${attempt} after error:`, error.message);
  },
};

/**
 * Retries a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if this is the last attempt
      if (attempt >= opts.maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = opts.baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000; // Add up to 1s of jitter
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelay);

      // Notify about retry
      opts.onRetry(lastError, attempt + 1);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError!;
}

/**
 * Retry with custom timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Combined retry with timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions?: RetryOptions
): Promise<T> {
  return withRetry(() => withTimeout(fn, timeoutMs), retryOptions);
}

/**
 * Usage examples:
 * 
 * // Basic retry
 * const data = await withRetry(() => 
 *   supabase.from('profiles').select('*').eq('id', userId)
 * );
 * 
 * // Retry with custom options
 * const data = await withRetry(
 *   () => supabase.from('profiles').select('*'),
 *   { maxRetries: 5, baseDelay: 2000 }
 * );
 * 
 * // Retry with timeout
 * const data = await withRetryAndTimeout(
 *   () => supabase.from('profiles').select('*'),
 *   5000, // 5 second timeout
 *   { maxRetries: 3 }
 * );
 */

