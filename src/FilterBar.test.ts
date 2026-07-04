import {describe, expect, it} from 'vitest'

import {countActiveFilters, isFilterActive} from './FilterBar'
import type {FilterDefinition} from './types'

describe('isFilterActive', () => {
  describe('select (single)', () => {
    const def: FilterDefinition = {kind: 'select', name: 'cat', title: 'Category', options: []}
    it('is active for a non-empty string', () => {
      expect(isFilterActive(def, 'kitchen')).toBe(true)
    })
    it('is inactive for the empty string, undefined or a non-string', () => {
      expect(isFilterActive(def, '')).toBe(false)
      expect(isFilterActive(def, undefined)).toBe(false)
      expect(isFilterActive(def, ['kitchen'])).toBe(false)
    })
  })

  describe('select (multiple)', () => {
    const def: FilterDefinition = {kind: 'select', name: 'cat', title: 'Category', multiple: true, options: []}
    it('is active for a non-empty array', () => {
      expect(isFilterActive(def, ['kitchen'])).toBe(true)
    })
    it('is inactive for an empty array or a bare string', () => {
      expect(isFilterActive(def, [])).toBe(false)
      expect(isFilterActive(def, 'kitchen')).toBe(false)
      expect(isFilterActive(def, undefined)).toBe(false)
    })
  })

  describe('toggle', () => {
    const def: FilterDefinition = {kind: 'toggle', name: 'inStock', title: 'In stock'}
    it('is active only for the literal `true`', () => {
      expect(isFilterActive(def, true)).toBe(true)
      expect(isFilterActive(def, false)).toBe(false)
      expect(isFilterActive(def, 'true')).toBe(false)
      expect(isFilterActive(def, undefined)).toBe(false)
    })
  })

  describe('text', () => {
    const def: FilterDefinition = {kind: 'text', name: 'sku', title: 'SKU'}
    it('ignores whitespace-only input', () => {
      expect(isFilterActive(def, 'SKU-1')).toBe(true)
      expect(isFilterActive(def, '   ')).toBe(false)
      expect(isFilterActive(def, '')).toBe(false)
      expect(isFilterActive(def, undefined)).toBe(false)
    })
  })

  describe('daterange', () => {
    const def: FilterDefinition = {kind: 'daterange', name: 'created', title: 'Created'}
    it('is active when either bound is set', () => {
      expect(isFilterActive(def, {from: '2026-01-01'})).toBe(true)
      expect(isFilterActive(def, {to: '2026-12-31'})).toBe(true)
      expect(isFilterActive(def, {from: '2026-01-01', to: '2026-12-31'})).toBe(true)
    })
    it('is inactive for an empty range, undefined or null', () => {
      expect(isFilterActive(def, {})).toBe(false)
      expect(isFilterActive(def, undefined)).toBe(false)
      expect(isFilterActive(def, null)).toBe(false)
    })
  })
})

describe('countActiveFilters', () => {
  const defs: FilterDefinition[] = [
    {kind: 'select', name: 'cat', title: 'Category', options: []},
    {kind: 'toggle', name: 'inStock', title: 'In stock'},
    {kind: 'text', name: 'sku', title: 'SKU'},
    {kind: 'daterange', name: 'created', title: 'Created'},
  ]

  it('returns 0 when nothing is set', () => {
    expect(countActiveFilters(defs, {})).toBe(0)
  })

  it('counts only the active filters', () => {
    expect(countActiveFilters(defs, {cat: 'kitchen', inStock: false, sku: '  '})).toBe(1)
    expect(countActiveFilters(defs, {cat: 'kitchen', inStock: true, sku: 'x', created: {from: '2026-01-01'}})).toBe(4)
  })

  it('ignores values for names not in the definitions', () => {
    expect(countActiveFilters(defs, {unknown: 'value'})).toBe(0)
  })

  it('returns 0 for an empty definition list', () => {
    expect(countActiveFilters([], {cat: 'kitchen'})).toBe(0)
  })
})
