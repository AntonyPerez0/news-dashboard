// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook reads navigator.wakeLock when its module loads, so the stand-in
// has to be in place before the import.
const request = vi.fn();
Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
const { useWakeLock } = await import('../src/hooks/useWakeLock');

function lock() {
  const sentinel = { released: false, release: vi.fn(async () => void (sentinel.released = true)) };
  return sentinel;
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useWakeLock', () => {
  it('asks for nothing while switched off', async () => {
    renderHook(() => useWakeLock(false));
    await settle();
    expect(request).not.toHaveBeenCalled();
  });

  it('holds a screen lock while on and lets go when switched off', async () => {
    const held = lock();
    request.mockResolvedValue(held);
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await settle();
    expect(request).toHaveBeenCalledWith('screen');

    rerender({ on: false });
    await settle();
    expect(held.release).toHaveBeenCalled();
  });

  it('takes the lock again after the browser drops it', async () => {
    const first = lock();
    request.mockResolvedValueOnce(first).mockResolvedValueOnce(lock());
    renderHook(() => useWakeLock(true));
    await settle();

    first.released = true; // what the browser does when the tab is hidden
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps trying when the browser refuses', async () => {
    request.mockRejectedValueOnce(new DOMException('battery saver', 'NotAllowedError')).mockResolvedValueOnce(lock());
    renderHook(() => useWakeLock(true));
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
