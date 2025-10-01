import { randomUUID } from 'crypto';
import { fetchWithTimeout } from './fetch-with-timeout';
import { ApiError, RateLimitError, TimeoutError } from './errors';
import { Logger } from './logger';

export interface ApiClientConfig {
  serviceName: string;
  baseUrl?: string;
  defaultTimeout?: number;
  defaultHeaders?: Record<string, string>;
}

/**
 * Centralized HTTP client with logging, error handling, and timeout support
 *
 * @example
 * const client = new ApiClient({ serviceName: 'coingecko' }, logger);
 * const data = await client.get('/simple/price', { params: { ids: 'bitcoin' } });
 */
export class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;
  private defaultHeaders: Record<string, string>;
  private serviceName: string;

  constructor(
    private config: ApiClientConfig,
    private logger: Logger
  ) {
    this.serviceName = config.serviceName;
    this.baseUrl = config.baseUrl || '';
    this.defaultTimeout = config.defaultTimeout || 30000;
    this.defaultHeaders = config.defaultHeaders || {};
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(
    path: string,
    options: {
      params?: Record<string, string | number | boolean>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);
    return this.request<T>(url, {
      method: 'GET',
      headers: options.headers,
      timeout: options.timeout,
    });
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options: {
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: options.timeout,
    });
  }

  /**
   * Make a generic HTTP request with logging and error handling
   */
  async request<T = unknown>(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<T> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const method = options.method || 'GET';

    // Merge headers
    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    const timeout = options.timeout || this.defaultTimeout;

    this.logger.info('API request started', {
      requestId,
      service: this.serviceName,
      method,
      url,
      timeout,
    });

    try {
      const response = await fetchWithTimeout(url, {
        ...options,
        headers,
        timeout,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text();

        this.logger.error('API request failed', {
          requestId,
          service: this.serviceName,
          method,
          url,
          status: response.status,
          duration,
          errorBody: errorBody.substring(0, 500), // Truncate large errors
        });

        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) : undefined
          );
        }

        throw new ApiError(
          response.status,
          `HTTP ${response.status}: ${errorBody}`,
          { url, method, service: this.serviceName }
        );
      }

      const data = await response.json();

      this.logger.info('API request success', {
        requestId,
        service: this.serviceName,
        method,
        url,
        status: response.status,
        duration,
      });

      return data as T;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof TimeoutError) {
        this.logger.warn('API request timeout', {
          requestId,
          service: this.serviceName,
          method,
          url,
          timeout,
          duration,
        });
        throw error;
      }

      if (error instanceof ApiError || error instanceof RateLimitError) {
        // Already logged above
        throw error;
      }

      this.logger.error('API request exception', {
        requestId,
        service: this.serviceName,
        method,
        url,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = this.baseUrl ? `${this.baseUrl}${path}` : path;

    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value));
    }

    return `${url}?${searchParams.toString()}`;
  }
}
