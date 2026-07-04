import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {errorMessage, formatRelativeTime, isAbortError} from './hooks'

describe('isAbortError', () => {
  it('is true for a DOMException-style AbortError', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('is true for the error thrown by AbortController.abort()', () => {
    const controller = new AbortController()
    controller.abort()
    // The reason on an aborted signal is an AbortError DOMException.
    expect(isAbortError(controller.signal.reason)).toBe(true)
  })

  it('is false for ordinary errors and non-errors', () => {
    expect(isAbortError(new Error('boom'))).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('HTTP 500'))).toBe('HTTP 500')
  })

  it('stringifies non-Error values', () => {
    expect(errorMessage('plain string')).toBe('plain string')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage(undefined)).toBe('undefined')
    expect(errorMessage({toString: () => 'custom'})).toBe('custom')
  })
})

describe('formatRelativeTime', () => {
  // Pin "now" so relative output is deterministic.
  const NOW = new Date('2026-07-06T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a time a few seconds in the past', () => {
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000).toISOString()
    expect(formatRelativeTime(tenSecondsAgo)).toBe('10 seconds ago')
  })

  it('formats minutes, hours and days in the past', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000).toISOString())).toBe('5 minutes ago')
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 3_600_000).toISOString())).toBe('3 hours ago')
    expect(formatRelativeTime(new Date(NOW.getTime() - 2 * 86_400_000).toISOString())).toBe('2 days ago')
  })

  it('uses "yesterday"/"tomorrow" style output where the locale provides it', () => {
    // numeric: 'auto' yields idiomatic phrasing at the ±1 boundaries.
    expect(formatRelativeTime(new Date(NOW.getTime() - 86_400_000).toISOString())).toBe('yesterday')
    expect(formatRelativeTime(new Date(NOW.getTime() + 86_400_000).toISOString())).toBe('tomorrow')
  })

  it('handles future timestamps', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 30_000).toISOString())).toBe('in 30 seconds')
  })

  it('returns the raw input for an unparseable date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date')
  })
})
