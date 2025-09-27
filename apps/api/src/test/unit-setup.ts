import { beforeEach, afterEach, vi } from 'vitest';

// Unit test setup - no database dependencies
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();

  // Reset any global state that might affect tests
  vi.clearAllTimers();

  // Ensure clean slate for each test
  if (global.fetch && vi.isMockFunction(global.fetch)) {
    global.fetch.mockClear();
  }
});

afterEach(() => {
  // Clean up any timers or async operations
  vi.clearAllTimers();
  vi.clearAllMocks();
});

// Global test utilities for unit tests
export const createMockResponse = (data: any, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

export const createMockError = (message: string, status = 500) => ({
  ok: false,
  status,
  text: async () => message,
});

// Helper for creating consistent mock fetch responses
export const mockFetchSuccess = (data: any) => createMockResponse(data, true, 200);
export const mockFetchError = (message: string, status = 500) => createMockError(message, status);