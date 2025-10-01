import { TimeoutError } from './errors';

/**
 * Fetch with automatic timeout using AbortController
 *
 * @param url - URL to fetch
 * @param options - Fetch options with optional timeout in milliseconds
 * @returns Response promise that rejects on timeout
 *
 * @example
 * const response = await fetchWithTimeout('https://api.example.com/data', {
 *   timeout: 10000, // 10 seconds
 *   method: 'GET',
 *   headers: { 'Accept': 'application/json' }
 * });
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(
        `Request timeout after ${timeout}ms`,
        timeout,
        url
      );
    }

    throw error;
  }
}

/**
 * Fetch with timeout and automatic retry on failure
 *
 * @param url - URL to fetch
 * @param options - Fetch options with timeout and retry configuration
 * @returns Response promise
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
  } = {}
): Promise<Response> {
  const { retries = 3, retryDelay = 1000, ...fetchOptions } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchWithTimeout(url, fetchOptions);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on timeout errors or 4xx client errors
      if (
        error instanceof TimeoutError ||
        (error instanceof Response && error.status >= 400 && error.status < 500)
      ) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries - 1) {
        await new Promise(resolve =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}
