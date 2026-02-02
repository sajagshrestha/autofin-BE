/**
 * LoggerService - central place for structured logging (error, warn, info).
 * No Discord or external integrations; single responsibility.
 */
export interface LoggerService {
  error(message: string, error?: unknown): void;
  warn(message: string, error?: unknown): void;
  info(message: string): void;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : '';
    return `${error.message}${stack}`;
  }
  return String(error);
}

export class LoggerServiceImpl implements LoggerService {
  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const suffix = error !== undefined ? ` ${formatError(error)}` : '';
    console.error(`[${timestamp}] ERROR: ${message}${suffix}`);
  }

  warn(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const suffix = error !== undefined ? ` ${formatError(error)}` : '';
    console.warn(`[${timestamp}] WARN: ${message}${suffix}`);
  }

  info(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] INFO: ${message}`);
  }
}
