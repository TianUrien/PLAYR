import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { withRetry, withTimeout, withRetryAndTimeout } from '@/lib/retry'

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error and succeeds on second attempt', async () => {
    const networkError = Object.assign(new Error('network error'), {})
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('recovered')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })

    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('exhausts all retries and throws the last error', async () => {
    const error = new Error('network failure')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 20 }))
      .rejects.toThrow('network failure')

    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry on non-retryable error', async () => {
    const rlsError = Object.assign(new Error('new row violates row-level security policy'), {
      code: '42501',
      status: 403,
    })
    const fn = vi.fn().mockRejectedValue(rlsError)

    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow('row-level security')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects maxRetries option', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network timeout'))

    await expect(withRetry(fn, { maxRetries: 1, baseDelay: 10, maxDelay: 20 }))
      .rejects.toThrow('network timeout')

    // 1 initial + 1 retry = 2 calls
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on Supabase gateway timeout code', async () => {
    const error = Object.assign(new Error('Gateway timeout'), { code: 'PGRST504' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on Supabase too many connections code', async () => {
    const error = Object.assign(new Error('Too many connections'), { code: '53300' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on connection failure code', async () => {
    const error = Object.assign(new Error('Connection failure'), { code: '08006' })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on HTTP 500 status', async () => {
    const error = Object.assign(new Error('Internal server error'), { status: 500 })
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })
    expect(result).toBe('ok')
  })

  it('retries on error message containing "rate limit"', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 20 })
    expect(result).toBe('ok')
  })

  it('does not retry on 404 status', async () => {
    const error = Object.assign(new Error('Not found'), { status: 404 })
    const fn = vi.fn().mockRejectedValue(error)

    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow('Not found')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback on each retry attempt', async () => {
    const onRetry = vi.fn()
    const fn = vi.fn().mockRejectedValue(new Error('network error'))

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 20, onRetry }))
      .rejects.toThrow()

    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2)
  })
})

describe('withTimeout', () => {
  it('returns the value when function completes within timeout', async () => {
    const fn = () => Promise.resolve('fast')
    const result = await withTimeout(fn, 5000)
    expect(result).toBe('fast')
  })

  it('rejects when function exceeds timeout', async () => {
    const fn = () => new Promise((resolve) => setTimeout(resolve, 5000))

    await expect(withTimeout(fn, 50)).rejects.toThrow('Operation timed out after 50ms')
  })
})

describe('withRetryAndTimeout', () => {
  it('combines retry and timeout behavior', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetryAndTimeout(fn, 5000, { baseDelay: 10 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rejects when all retries time out', async () => {
    const fn = () => new Promise<string>(() => {}) // Never resolves

    await expect(
      withRetryAndTimeout(fn, 50, { maxRetries: 1, baseDelay: 10, maxDelay: 20 })
    ).rejects.toThrow('Operation timed out')
  })
})
