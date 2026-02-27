/**
 * Simple logging utility with timestamps and context
 */

import { LogLevel, LogEntry } from '../types/index.js';

const LOG_COLORS: Record<LogLevel, string> = {
  info: '\x1b[36m',    // Cyan
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
  debug: '\x1b[90m',   // Gray
};

const RESET = '\x1b[0m';

/**
 * Format a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const color = LOG_COLORS[entry.level];
  const levelStr = entry.level.toUpperCase().padEnd(5);
  const contextStr = entry.context
    ? ` ${JSON.stringify(entry.context)}`
    : '';

  return `${color}[${entry.timestamp}] ${levelStr}${RESET} ${entry.message}${contextStr}`;
}

/**
 * Log a message with optional context
 */
export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  const formatted = formatLogEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'debug':
      if (process.env.DEBUG) {
        console.log(formatted);
      }
      break;
    case 'info':
    default:
      console.log(formatted);
      break;
  }
}

/**
 * Convenience methods for each log level
 */
export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
};
