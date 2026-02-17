import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { requestCache, generateCacheKey } from '@/lib/requestCache'

describe('requestCache', () => {
  beforeEach(() => {
    requestCache.clear()
    vi.clearAllMocks()
  })

  it('returns fresh data on first call', async () => {
    const fn = vi.fn().mockResolvedValue('data')
    const result = await requestCache.dedupe('test-key', fn)

    expect(result).toBe('data')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('returns cached value within TTL', async () => {
    const fn = vi.fn().mockResolvedValue('data')

    const first = await requestCache.dedupe('test-key', fn, 60000)
    const second = await requestCache.dedupe('test-key', fn, 60000)

    expect(first).toBe('data')
    expect(second).toBe('data')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after TTL expires', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new')

    const first = await requestCache.dedupe('test-key', fn, 1) // 1ms TTL
    await new Promise((r) => setTimeout(r, 10)) // Wait for TTL to expire
    const second = await requestCache.dedupe('test-key', fn, 1)

    expect(first).toBe('old')
    expect(second).toBe('new')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent calls for the same key', async () => {
    let resolvePromise: (value: string) => void
    const fn = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => { resolvePromise = resolve })
    )

    const promise1 = requestCache.dedupe('test-key', fn)
    const promise2 = requestCache.dedupe('test-key', fn)

    resolvePromise!('shared-data')

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1).toBe('shared-data')
    expect(result2).toBe('shared-data')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('invalidate with string removes specific cache entry', async () => {
    const fn1 = vi.fn().mockResolvedValue('a')
    const fn2 = vi.fn().mockResolvedValue('b')

    await requestCache.dedupe('key-a', fn1, 60000)
    await requestCache.dedupe('key-b', fn2, 60000)

    requestCache.invalidate('key-a')

    const fnA2 = vi.fn().mockResolvedValue('a-new')
    const resultA = await requestCache.dedupe('key-a', fnA2, 60000)
    const resultB = await requestCache.dedupe('key-b', fn2, 60000)

    expect(resultA).toBe('a-new')
    expect(resultB).toBe('b')
    expect(fnA2).toHaveBeenCalledTimes(1)
    // fn2 should not be called again (still cached)
    expect(fn2).toHaveBeenCalledTimes(1)
  })

  it('invalidate with RegExp removes matching entries', async () => {
    const fn = vi.fn().mockResolvedValue('data')

    await requestCache.dedupe('profiles:123', fn, 60000)
    await requestCache.dedupe('profiles:456', fn, 60000)
    await requestCache.dedupe('messages:789', fn, 60000)

    requestCache.invalidate(/^profiles:/)

    const stats = requestCache.getStats()
    expect(stats.cacheSize).toBe(1) // only messages:789 remains
  })

  it('clear empties all cache and in-flight requests', async () => {
    const fn = vi.fn().mockResolvedValue('data')
    await requestCache.dedupe('key-1', fn, 60000)
    await requestCache.dedupe('key-2', fn, 60000)

    requestCache.clear()

    const stats = requestCache.getStats()
    expect(stats.cacheSize).toBe(0)
    expect(stats.inFlightCount).toBe(0)
  })

  it('getStats returns correct counts', async () => {
    const fn = vi.fn().mockResolvedValue('data')

    await requestCache.dedupe('a', fn, 60000)
    await requestCache.dedupe('b', fn, 60000)

    const stats = requestCache.getStats()
    expect(stats.cacheSize).toBe(2)
    expect(stats.inFlightCount).toBe(0)
  })
})

describe('generateCacheKey', () => {
  it('returns just resource name without params', () => {
    expect(generateCacheKey('profiles')).toBe('profiles')
  })

  it('returns resource with sorted params', () => {
    const key = generateCacheKey('profiles', { id: '123', role: 'player' })
    expect(key).toBe('profiles?id="123"&role="player"')
  })

  it('produces deterministic keys regardless of param order', () => {
    const key1 = generateCacheKey('profiles', { role: 'player', id: '123' })
    const key2 = generateCacheKey('profiles', { id: '123', role: 'player' })
    expect(key1).toBe(key2)
  })

  it('handles complex param values', () => {
    const key = generateCacheKey('search', { filters: ['a', 'b'], page: 1 })
    expect(key).toContain('search?')
    expect(key).toContain('filters=["a","b"]')
    expect(key).toContain('page=1')
  })
})
