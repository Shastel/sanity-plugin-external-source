import {defineAdapter, type ExternalItem} from '../../src'

const API = 'https://pokeapi.co/api/v2'
const PAGE_SIZE = 24

export interface PokemonListResult {
  name: string
  url: string
}

interface PokemonListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PokemonListResult[]
}

export function idFromUrl(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() ?? url
}

export function artworkUrl(id: string): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
}

export function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}

export function toPokemonItem(result: PokemonListResult): ExternalItem {
  const id = idFromUrl(result.url)
  return {
    id,
    title: capitalize(result.name),
    subtitle: `#${id}`,
    imageUrl: artworkUrl(id),
    raw: result
  }
}

// PokeAPI has no server-side search, so search filters a module-cached full
// list client-side. The cached fetch deliberately ignores the abort signal —
// it is shared across requests. A failed load clears the cache for retry.
let fullListPromise: Promise<PokemonListResult[]> | null = null

function loadFullList(): Promise<PokemonListResult[]> {
  if (!fullListPromise) {
    fullListPromise = fetch(`${API}/pokemon?limit=100000&offset=0`)
      .then(response => {
        if (!response.ok) throw new Error(`PokeAPI: HTTP ${response.status}`)
        return response.json() as Promise<PokemonListResponse>
      })
      .then(json => json.results)
      .catch((err: unknown) => {
        fullListPromise = null
        throw err
      })
  }
  return fullListPromise
}

/**
 * Hand-written generator adapter: pagination state is plain local variables
 * (a slice offset for client-side search, PokeAPI's `next` URL otherwise),
 * and the last page is `return`ed instead of `yield`ed so the dialog hides
 * "Load more" without an extra probing click.
 */
export const pokemonAdapter = defineAdapter({
  name: 'pokemon',
  title: 'Pokémon',
  searchPlaceholder: 'Search Pokémon by name…',

  async *fetch({query, signal}) {
    const needle = query.trim().toLowerCase()

    if (needle) {
      const all = await loadFullList()
      const matches = all.filter(result => result.name.includes(needle))
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = matches.slice(offset, offset + PAGE_SIZE).map(toPokemonItem)
        if (offset + PAGE_SIZE >= matches.length) {
          return page
        }
        yield page
      }
    }

    let url = `${API}/pokemon?offset=0&limit=${PAGE_SIZE}`
    for (;;) {
      const response = await fetch(url, {signal})
      if (!response.ok) {
        throw new Error(`PokeAPI: HTTP ${response.status}`)
      }
      const json = (await response.json()) as PokemonListResponse
      const items = json.results.map(toPokemonItem)
      if (!json.next) {
        return items
      }
      yield items
      url = json.next
    }
  },

  async resolve(id) {
    const response = await fetch(`${API}/pokemon/${id}`)
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`PokeAPI: HTTP ${response.status}`)
    }
    const json = (await response.json()) as {id: number; name: string}
    return {
      id: String(json.id),
      title: capitalize(json.name),
      subtitle: `#${json.id}`,
      imageUrl: artworkUrl(String(json.id)),
      raw: {name: json.name, url: `${API}/pokemon/${json.id}/`}
    }
  }
})
