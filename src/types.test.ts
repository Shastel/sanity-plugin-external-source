import {describe, expect, it} from 'vitest'

import {DEFAULT_TYPE_NAME, defineAdapter} from './types'

describe('DEFAULT_TYPE_NAME', () => {
  it('is the documented default schema type name', () => {
    expect(DEFAULT_TYPE_NAME).toBe('external.item')
  })
})

describe('defineAdapter', () => {
  it('returns the same adapter object (identity helper)', () => {
    const adapter = {
      name: 'pokemon',
      title: 'Pokémon',
      fetch: async () => [],
    }
    expect(defineAdapter(adapter)).toBe(adapter)
  })
})
