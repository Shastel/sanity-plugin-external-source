import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {ExternalItem, FetchContext} from '../types'
import {createRestAdapter} from './rest'

/** Minimal FetchContext for driving an adapter's `fetch` in tests. */
function ctx(overrides: Partial<FetchContext> = {}): FetchContext {
  return {
    query: '',
    filters: {},
    signal: new AbortController().signal,
    ...overrides,
  }
}

/** Build a `Response`-like stub good enough for the adapter's use of `fetch`. */
function jsonResponse(body: unknown, init: {ok?: boolean; status?: number; statusText?: string} = {}) {
  const status = init.status ?? 200
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: init.statusText ?? '',
    json: async () => body,
  } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRestAdapter — passthrough config', () => {
  it('copies presentation options onto the adapter', () => {
    const icon = () => null
    const renderTile = () => null
    const adapter = createRestAdapter({
      name: 'articles',
      title: 'Articles',
      icon,
      defaultLayout: 'list',
      disableSearch: true,
      searchPlaceholder: 'Find…',
      filters: [{kind: 'toggle', name: 'live', title: 'Live only'}],
      renderTile,
      buildUrl: () => 'https://api.test/a',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })

    expect(adapter.name).toBe('articles')
    expect(adapter.title).toBe('Articles')
    expect(adapter.icon).toBe(icon)
    expect(adapter.defaultLayout).toBe('list')
    expect(adapter.disableSearch).toBe(true)
    expect(adapter.searchPlaceholder).toBe('Find…')
    expect(adapter.filters).toEqual([{kind: 'toggle', name: 'live', title: 'Live only'}])
    expect(adapter.renderTile).toBe(renderTile)
  })

  it('does not attach `resolve` unless `resolveUrl` is provided', () => {
    const adapter = createRestAdapter({
      name: 'x',
      title: 'X',
      buildUrl: () => 'https://api.test/x',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })
    expect(adapter.resolve).toBeUndefined()
  })
})

describe('createRestAdapter — fetch', () => {
  it('builds the first-page URL from query/filters and maps items', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({items: [{id: 1, name: 'Chair'}]}))

    const adapter = createRestAdapter<{id: number; name: string}>({
      name: 'products',
      title: 'Products',
      buildUrl: (c) => `https://api.test/p?q=${encodeURIComponent(c.query)}`,
      selectItems: (json) => (json as {items: {id: number; name: string}[]}).items,
      mapItem: (raw) => ({id: String(raw.id), title: raw.name, raw}),
    })

    const iterator = adapter.fetch(ctx({query: 'ch air'})) as AsyncGenerator<ExternalItem[], ExternalItem[]>
    const first = await iterator.next()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/p?q=ch%20air')
    // Single-page (no nextUrl): the page is `return`ed, so `done` is true.
    expect(first.done).toBe(true)
    expect(first.value).toEqual([{id: '1', title: 'Chair', raw: {id: 1, name: 'Chair'}}])
  })

  it('accepts a URL object from buildUrl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({items: []}))
    const adapter = createRestAdapter({
      name: 'p',
      title: 'P',
      buildUrl: () => new URL('https://api.test/p?page=1'),
      selectItems: (json) => (json as {items: unknown[]}).items,
      mapItem: (raw) => raw as ExternalItem,
    })
    await (adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[]>).next()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/p?page=1')
  })

  it('paginates by following nextUrl until it returns null', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({items: [{id: 'a'}], next: 'https://api.test/p?page=2'}))
      .mockResolvedValueOnce(jsonResponse({items: [{id: 'b'}], next: 'https://api.test/p?page=3'}))
      .mockResolvedValueOnce(jsonResponse({items: [{id: 'c'}], next: null}))

    const adapter = createRestAdapter<{id: string}, ExternalItem & {id: string}>({
      name: 'p',
      title: 'P',
      buildUrl: () => 'https://api.test/p?page=1',
      nextUrl: (json) => (json as {next: string | null}).next,
      selectItems: (json) => (json as {items: {id: string}[]}).items,
      mapItem: (raw) => ({id: raw.id, raw}),
    })

    const iterator = adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[], ExternalItem[]>
    const p1 = await iterator.next()
    const p2 = await iterator.next()
    const p3 = await iterator.next()

    expect(p1).toEqual({done: false, value: [{id: 'a', raw: {id: 'a'}}]})
    expect(p2).toEqual({done: false, value: [{id: 'b', raw: {id: 'b'}}]})
    // Last page is `return`ed (done: true) because nextUrl is null.
    expect(p3.done).toBe(true)
    expect(p3.value).toEqual([{id: 'c', raw: {id: 'c'}}])

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.test/p?page=1',
      'https://api.test/p?page=2',
      'https://api.test/p?page=3',
    ])
  })

  it('passes the abort signal through to fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({items: []}))
    const controller = new AbortController()
    const adapter = createRestAdapter({
      name: 'p',
      title: 'P',
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })
    await (adapter.fetch(ctx({signal: controller.signal})) as AsyncGenerator<ExternalItem[]>).next()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({signal: controller.signal})
  })

  it('throws "HTTP <status> <statusText>" on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, {ok: false, status: 503, statusText: 'Service Unavailable'}))
    const adapter = createRestAdapter({
      name: 'p',
      title: 'P',
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })
    await expect((adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[]>).next()).rejects.toThrow(
      'HTTP 503 Service Unavailable',
    )
  })

  it('trims the error message when statusText is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, {ok: false, status: 500, statusText: ''}))
    const adapter = createRestAdapter({
      name: 'p',
      title: 'P',
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })
    await expect((adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[]>).next()).rejects.toThrow(/^HTTP 500$/)
  })
})

describe('createRestAdapter — headers', () => {
  it('sends a static headers object', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({items: []}))
    const adapter = createRestAdapter({
      name: 'p',
      title: 'P',
      headers: {Authorization: 'Bearer static'},
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => raw as ExternalItem,
    })
    await (adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[]>).next()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({headers: {Authorization: 'Bearer static'}})
  })

  it('calls an async headers factory per request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({items: [{id: 'a'}], next: 'https://api.test/p?page=2'}))
      .mockResolvedValueOnce(jsonResponse({items: [{id: 'b'}], next: null}))
    const headers = vi.fn(async () => ({Authorization: 'Bearer dynamic'}))
    const adapter = createRestAdapter<{id: string}>({
      name: 'p',
      title: 'P',
      headers,
      buildUrl: () => 'https://api.test/p?page=1',
      nextUrl: (json) => (json as {next: string | null}).next,
      selectItems: (json) => (json as {items: {id: string}[]}).items,
      mapItem: (raw) => ({id: raw.id, raw}),
    })
    const iterator = adapter.fetch(ctx()) as AsyncGenerator<ExternalItem[]>
    await iterator.next()
    await iterator.next()
    expect(headers).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({headers: {Authorization: 'Bearer dynamic'}})
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({headers: {Authorization: 'Bearer dynamic'}})
  })
})

describe('createRestAdapter — resolve', () => {
  const makeAdapter = () =>
    createRestAdapter<{id: number; name: string}>({
      name: 'p',
      title: 'P',
      headers: {'X-Key': 'abc'},
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => ({id: String(raw.id), title: raw.name, raw}),
      resolveUrl: (id) => `https://api.test/p/${id}`,
    })

  it('fetches one item by id and maps it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({id: 7, name: 'Lamp'}))
    const adapter = makeAdapter()
    const item = await adapter.resolve?.('7')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/p/7')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({headers: {'X-Key': 'abc'}})
    expect(item).toEqual({id: '7', title: 'Lamp', raw: {id: 7, name: 'Lamp'}})
  })

  it('returns null on 404 (item gone upstream)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, {ok: false, status: 404, statusText: 'Not Found'}))
    const adapter = makeAdapter()
    await expect(adapter.resolve?.('99')).resolves.toBeNull()
  })

  it('throws on other non-OK statuses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, {ok: false, status: 500, statusText: 'Server Error'}))
    const adapter = makeAdapter()
    await expect(adapter.resolve?.('1')).rejects.toThrow('HTTP 500 Server Error')
  })

  it('unwraps the response through mapResolved before mapItem', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({data: {id: 3, name: 'Desk'}}))
    const adapter = createRestAdapter<{id: number; name: string}>({
      name: 'p',
      title: 'P',
      buildUrl: () => 'https://api.test/p',
      selectItems: () => [],
      mapItem: (raw) => ({id: String(raw.id), title: raw.name, raw}),
      resolveUrl: (id) => `https://api.test/p/${id}`,
      mapResolved: (json) => (json as {data: {id: number; name: string}}).data,
    })
    const item = await adapter.resolve?.('3')
    expect(item).toEqual({id: '3', title: 'Desk', raw: {id: 3, name: 'Desk'}})
  })
})
