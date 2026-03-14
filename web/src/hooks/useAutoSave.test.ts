import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls onError after retries are exhausted', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network down'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAutoSave({
        onSave,
        onError,
        throttleMs: 10,
        maxRetries: 2,
      })
    );

    act(() => {
      result.current('Updated title');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onSave.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }));
  });
});
