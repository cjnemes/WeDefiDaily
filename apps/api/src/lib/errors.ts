/**
 * Custom error classes for better error handling
 */

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public timeoutMs: number,
    public url?: string
  ) {
    super(message);
    this.name = 'TimeoutError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, public retryAfter?: number) {
    super(429, message, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}
