/**
 * Structured logging for agents
 */

import type { AgentLogger } from '../types/agents';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger implements AgentLogger {
  private minLevel: LogLevel;
  private context: Record<string, unknown>;
  
  constructor(minLevel: LogLevel = 'info', context: Record<string, unknown> = {}) {
    this.minLevel = minLevel;
    this.context = context;
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }
  
  private log(level: LogLevel, message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      meta: { ...this.context, ...meta },
    };
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    
    // Output to console based on level
    const output = JSON.stringify(entry);
    
    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, undefined, meta);
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, undefined, meta);
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, undefined, meta);
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log('error', message, error, meta);
  }
  
  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger(this.minLevel, { ...this.context, ...context });
  }
}

/**
 * Create a logger from environment
 */
export function createLogger(env: { LOG_LEVEL?: string }, context?: Record<string, unknown>): Logger {
  const level = (env.LOG_LEVEL || 'info') as LogLevel;
  return new Logger(level, context);
}
