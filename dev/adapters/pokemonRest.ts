import {createRestAdapter} from '../../src'
import {artworkUrl, capitalize, idFromUrl, type PokemonListResult} from './pokemon'

/**
 * `createRestAdapter` demo: `buildUrl` is the first page, `nextUrl` returns
 * PokeAPI's `next` URL verbatim (null at the end) — the factory paginates.
 */
export const pokemonRestAdapter = createRestAdapter<PokemonListResult>({
  name: 'pokemon-rest',
  title: 'Poké REST',
  disableSearch: true,

  // Demo: mapValue restricts the stored shape — no title/subtitle/imageUrl,
  // only the id. Framework fields (_type, source, syncedAt) still applied.
  mapValue: item => ({externalId: item.id}),

  buildUrl: () => 'https://pokeapi.co/api/v2/pokemon?limit=24',

  nextUrl: json => (json as {next: string | null}).next,

  selectItems: json => (json as {results: PokemonListResult[]}).results,

  mapItem: raw => {
    const id = idFromUrl(raw.url)
    return {
      id,
      title: capitalize(raw.name),
      subtitle: `#${id}`,
      imageUrl: artworkUrl(id),
      raw
    }
  },

  resolveUrl: id => `https://pokeapi.co/api/v2/pokemon/${id}`,
  mapResolved: json => {
    const detail = json as {id: number; name: string}
    return {name: detail.name, url: `https://pokeapi.co/api/v2/pokemon/${detail.id}/`}
  }
})
