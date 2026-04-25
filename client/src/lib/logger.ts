/**
 * Logger Utility
 * Only logs debug/info in development, always logs warnings/errors
 * Prevents sensitive data leakage in production
 */

import * as Sentry from '@sentry/react';

const isDev = import.meta.env.DEV;

// Truncate breadcrumb messages so we never blow past Sentry's 8KB limit on
// a single oversized object dump.
const MAX_BREADCRUMB_MESSAGE_LENGTH = 500;

function summarizeArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      if (arg && typeof arg === 'object') {
        const maybeMessage = (arg as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') return maybeMessage;
        return '[object]';
      }
      return String(arg);
    })
    .join(' ')
    .slice(0, MAX_BREADCRUMB_MESSAGE_LENGTH);
}

export const logger = {
  /**
   * Debug logging - only in development
   * Use for detailed debugging information
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info logging - only in development
   * Use for general informational messages
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Warning logging - always enabled
   * Use for recoverable issues that need attention
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
    Sentry.addBreadcrumb({
      category: 'logger.warn',
      level: 'warning',
      message: summarizeArgs(args),
    });
  },

  /**
   * Error logging - always enabled
   * Use for errors and exceptions
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
    Sentry.addBreadcrumb({
      category: 'logger.error',
      level: 'error',
      message: summarizeArgs(args),
    });
  },

  /**
   * Performance measurement - only in development
   * Use for timing critical operations
   */
  time: (label: string) => {
    if (isDev) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (isDev) {
      console.timeEnd(label);
    }
  },
};

export default logger;
