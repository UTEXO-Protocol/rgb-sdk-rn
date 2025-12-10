/**
 * Logger utility for the SDK
 * Provides structured logging with configurable log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  private level: LogLevel = LogLevel.ERROR;

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Log debug messages
   */
  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug('[SDK DEBUG]', ...args);
    }
  }

  /**
   * Log info messages
   */
  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info('[SDK INFO]', ...args);
    }
  }

  /**
   * Log warning messages
   */
  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn('[SDK WARN]', ...args);
    }
  }

  /**
   * Log error messages
   */
  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error('[SDK ERROR]', ...args);
    }
  }
}

export const logger = new Logger();

/**
 * Configure SDK logging
 */
export function configureLogging(level: LogLevel): void {
  logger.setLevel(level);
}

