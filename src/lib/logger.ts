type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const context = entry.context ? ` [${entry.context}]` : '';
  const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
  return `${base}${context} ${entry.message}${details}`;
}

export const logger = {
  info(message: string, context?: string, details?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'info',
      message,
      context,
      timestamp: new Date().toISOString(),
      details,
    };
    console.log(formatLog(entry));
  },

  warn(message: string, context?: string, details?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'warn',
      message,
      context,
      timestamp: new Date().toISOString(),
      details,
    };
    console.warn(formatLog(entry));
  },

  error(message: string, context?: string, error?: Error, details?: Record<string, unknown>) {
    const entry: LogEntry = {
      level: 'error',
      message,
      context,
      timestamp: new Date().toISOString(),
      details: {
        ...details,
        ...(error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : {}),
      },
    };
    console.error(formatLog(entry));
  },
};
