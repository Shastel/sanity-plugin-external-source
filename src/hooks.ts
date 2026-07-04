import {useCallback, useEffect, useState} from 'react'

import type {ItemLayout} from './types'

/** Returns `value` after it has been stable for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}

const LAYOUT_KEY_PREFIX = 'sanity-plugin-external-source:layout:'

function readStoredLayout(key: string): ItemLayout | null {
  try {
    if (typeof window === 'undefined') {
      return null
    }
    const value = window.localStorage.getItem(key)
    return value === 'grid' || value === 'list' ? value : null
  } catch {
    return null
  }
}

/**
 * Grid/list layout preference persisted per adapter in localStorage.
 * Mount with `key={adapterName}` so the initializer re-runs when the adapter changes.
 */
export function useStoredLayout(
  adapterName: string,
  defaultLayout: ItemLayout = 'grid'
): [ItemLayout, (layout: ItemLayout) => void] {
  const key = LAYOUT_KEY_PREFIX + adapterName
  const [layout, setLayoutState] = useState<ItemLayout>(() => readStoredLayout(key) ?? defaultLayout)

  const setLayout = useCallback(
    (next: ItemLayout) => {
      setLayoutState(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Persistence is best-effort (private mode, blocked storage)
      }
    },
    [key]
  )

  return [layout, setLayout]
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const TIME_DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'seconds'],
  [60, 'minutes'],
  [24, 'hours'],
  [7, 'days'],
  [4.34524, 'weeks'],
  [12, 'months'],
  [Number.POSITIVE_INFINITY, 'years']
]

/** "3 days ago" formatting for `syncedAt`, without any date library. */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const formatter = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})
  let duration = (date.getTime() - Date.now()) / 1000

  for (const [amount, unit] of TIME_DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return formatter.format(Math.round(duration), unit)
    }
    duration /= amount
  }
  return formatter.format(Math.round(duration), 'years')
}
