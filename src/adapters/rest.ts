import type {ComponentType, ReactNode} from 'react'

import type {
  ExternalItem,
  ExternalItemValue,
  ExternalSourceAdapter,
  FetchContext,
  FilterDefinition,
  ItemLayout,
  TileProps
} from '../types'

/**
 * Options for {@link createRestAdapter} — a small adapter factory for
 * JSON-over-HTTP APIs. You provide URL building and mapping; the factory
 * handles fetching, HTTP errors, abort signals and 404s on resolve.
 * Everything is explicit — the factory never guesses at response shapes.
 *
 * Note: requests run in the browser, so the API must allow CORS from the
 * Studio origin. For authenticated APIs, point `buildUrl` at a small
 * serverless proxy instead of shipping credentials to the browser.
 */
export interface RestAdapterOptions<TRaw = unknown, TItem extends ExternalItem = ExternalItem> {
  /** See {@link ExternalSourceAdapter.name}. */
  name: string
  /** See {@link ExternalSourceAdapter.title}. */
  title: string
  icon?: ComponentType
  filters?: FilterDefinition[]
  defaultLayout?: ItemLayout
  disableSearch?: boolean
  searchPlaceholder?: string
  /** Build the URL of the **first** page from the current query and filters. */
  buildUrl(ctx: FetchContext): string | URL
  /**
   * Build the URL of the **next** page from the last response body.
   * Return `null` when there are no more pages. Omit entirely for
   * single-page APIs — the dialog then never shows "Load more".
   */
  nextUrl?(json: unknown, ctx: FetchContext): string | URL | null
  /** Static headers, or a (possibly async) factory called per request. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  /** Pick the array of raw records out of the response body, e.g. `json => json.results`. */
  selectItems(json: unknown): TRaw[]
  /** Map one raw record to an {@link ExternalItem}. Put the record itself in `raw`. */
  mapItem(raw: TRaw): TItem
  /** Build the URL to fetch a single record by id. Enables the "Refresh" action. */
  resolveUrl?(id: string): string | URL
  /** Unwrap the resolve response into a raw record (e.g. `json => json.data`). Default: identity. */
  mapResolved?(json: unknown): TRaw
  /** See {@link ExternalSourceAdapter.mapValue}. */
  mapValue?(item: TItem): Record<string, unknown>
  /** See {@link ExternalSourceAdapter.renderTile}. */
  renderTile?(props: TileProps<TItem>): ReactNode
  /** See {@link ExternalSourceAdapter.renderPreview}. */
  renderPreview?(props: {value: ExternalItemValue}): ReactNode
}

function toUrlString(url: string | URL): string {
  return typeof url === 'string' ? url : url.toString()
}

/** Create an {@link ExternalSourceAdapter} for a JSON REST API. */
export function createRestAdapter<TRaw = unknown, TItem extends ExternalItem = ExternalItem>(
  options: RestAdapterOptions<TRaw, TItem>
): ExternalSourceAdapter<TItem> {
  async function resolveHeaders(): Promise<HeadersInit | undefined> {
    return typeof options.headers === 'function' ? options.headers() : options.headers
  }

  async function requestJson(url: string | URL, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(toUrlString(url), {signal, headers: await resolveHeaders()})
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
    }
    return response.json()
  }

  const adapter: ExternalSourceAdapter<TItem> = {
    name: options.name,
    title: options.title,
    icon: options.icon,
    filters: options.filters,
    defaultLayout: options.defaultLayout,
    disableSearch: options.disableSearch,
    searchPlaceholder: options.searchPlaceholder,
    mapValue: options.mapValue,
    renderTile: options.renderTile,
    renderPreview: options.renderPreview,

    async *fetch(ctx: FetchContext): AsyncGenerator<TItem[], TItem[]> {
      let url: string | URL = options.buildUrl(ctx)
      for (;;) {
        const json = await requestJson(url, ctx.signal)
        const items = options.selectItems(json).map(raw => options.mapItem(raw))
        const next = options.nextUrl ? (options.nextUrl(json, ctx) ?? null) : null
        if (next === null) {
          // `return` instead of `yield` — the dialog hides "Load more" right away
          return items
        }
        yield items
        url = next
      }
    }
  }

  const {resolveUrl, mapResolved} = options
  if (resolveUrl) {
    adapter.resolve = async (id: string) => {
      const response = await fetch(toUrlString(resolveUrl(id)), {headers: await resolveHeaders()})
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
      }
      const json: unknown = await response.json()
      const raw = mapResolved ? mapResolved(json) : (json as TRaw)
      return options.mapItem(raw)
    }
  }

  return adapter
}
