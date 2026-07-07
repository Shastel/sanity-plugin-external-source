# sanity-plugin-external-source

A generic visual picker for **any external API** in Sanity Studio.

Give editors a native-feeling dialog with preview tiles, search, filters and pagination for data that lives outside Sanity — a PIM, a DAM, an internal REST service, a public API. You write a small **adapter** (one `fetch` function); the plugin does the rest.

- 🧩 **Adapter pattern** — the plugin knows nothing about your API
- 🖼 **Visual picker dialog** — tiles or rows, with image fallbacks, loading skeletons and empty states
- 🔎 **Search + declarative filters** — select, multi-select, toggle, text and date-range, rendered for you
- 📄 **Pagination is just a generator** — `yield` pages from an `async *fetch`; the plugin handles "Load more", dedup and cancellation
- 🗂 **Multiple sources** — register several adapters and get source tabs
- 🧾 **Snapshot storage** — source, id, title, image and raw JSON payload stored on the document, queryable with GROQ
- ♻️ **Refresh** — re-sync the stored snapshot from the source with one click
- 🎨 **Custom renderers** — override tiles and the preview card per adapter, keep the plugin's UX plumbing

Built exclusively with [`@sanity/ui`](https://www.sanity.io/ui), so it looks and feels native in the Studio.

## Installation

```sh
npm install sanity-plugin-external-source
```

Compatible with Sanity Studio **v3.78+, v4, v5 and v6** (Node 20.19+).

## Quick start

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {externalSource} from 'sanity-plugin-external-source'

export default defineConfig({
  // ...
  plugins: [externalSource()]
})
```

Register the schema type once via the plugin; adapters live on each **field**:

```ts
import {defineField} from 'sanity'
import {createRestAdapter} from 'sanity-plugin-external-source'

const productsAdapter = createRestAdapter({
  name: 'products',
  title: 'Products',
  buildUrl: ctx => `https://api.example.com/products?q=${encodeURIComponent(ctx.query)}`,
  nextUrl: json => json.nextPageUrl ?? null, // omit for APIs without pagination
  selectItems: json => json.items,
  mapItem: raw => ({
    id: String(raw.id),
    title: raw.name,
    subtitle: raw.sku,
    imageUrl: raw.thumbnail,
    raw
  })
})

defineField({
  name: 'featuredProduct',
  title: 'Featured product',
  type: 'external.item',
  options: {
    adapters: [productsAdapter] // one field, one source
  }
})
```

Fields can mix multiple adapters and get source tabs in the picker:

```ts
defineField({
  name: 'anyExternal',
  type: 'external.item',
  options: {adapters: [productsAdapter, mediaAdapter, pimAdapter]}
})
```

Different fields on the same document can use completely different adapter lists — pickers are scoped per field.

Editors get a preview card with **Select / Replace**, **Refresh** and **Clear** actions, and a full-width picker dialog.

## What gets stored

Selecting an item snapshots it into the document:

```ts
{
  _type: 'external.item',   // configurable via `typeName`
  source: 'products',       // adapter name
  externalId: '8231',
  title: 'Aurora Desk 100',
  subtitle: 'SKU-1000',
  imageUrl: 'https://…/thumb.png',
  payload: '{"id":8231,…}', // JSON.stringify of the raw record (disable with storePayload: false)
  syncedAt: '2026-07-03T12:00:00.000Z'
}
```

All fields are declared in the schema, so GROQ works as expected:

```groq
*[_type == "page" && featuredProduct.source == "products"]{
  title,
  "productId": featuredProduct.externalId,
  "productImage": featuredProduct.imageUrl,
  "syncedAt": featuredProduct.syncedAt
}
```

> `payload` is a JSON **string** (GROQ has no JSON parsing) — parse it in your frontend when you need the full record.

## Writing an adapter

An adapter is a plain object with one loading function. `fetch` comes in two forms:

- **`async` function** returning all items — for APIs where one request is enough.
- **`async *` generator** yielding pages — each **Load more** click pulls one more page. Pagination state is just your local variables; the plugin never sees it.

Here is a complete, working generator adapter for the public PokeAPI:

```ts
import {defineAdapter} from 'sanity-plugin-external-source'

const API = 'https://pokeapi.co/api/v2'

export const pokemonAdapter = defineAdapter({
  name: 'pokemon', // stored in documents as `source` — keep it stable!
  title: 'Pokémon', // tab label

  async *fetch({query, signal}) {
    let url = `${API}/pokemon?limit=24&q=${encodeURIComponent(query)}`
    while (url) {
      const res = await fetch(url, {signal}) // signal: stale runs get aborted
      if (!res.ok) throw new Error(`PokeAPI: HTTP ${res.status}`) // shown inline in the dialog

      const json = await res.json()
      const items = json.results.map(r => {
        const id = r.url.replace(/\/+$/, '').split('/').pop()
        return {
          id,
          title: r.name,
          imageUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
          raw: r
        }
      })

      if (!json.next) return items // `return` the last page → "Load more" hides immediately
      yield items // one page per "Load more" click
      url = json.next
    }
  },

  // Optional: enables the "Refresh" button on the input
  async resolve(id) {
    const res = await fetch(`${API}/pokemon/${id}`)
    if (res.status === 404) return null // item gone upstream
    if (!res.ok) throw new Error(`PokeAPI: HTTP ${res.status}`)
    const p = await res.json()
    return {
      id: String(p.id),
      title: p.name,
      imageUrl: p.sprites.other['official-artwork'].front_default,
      raw: p
    }
  }
})
```

The contract in one picture:

```
            ┌───────────────────────────────────────────────────┐
 plugin ──▶ │ fetch({query, filters, signal})                   │ ──▶ your API
            │   async fn   → resolve with all items             │
            │   async gen  → yield one page per "Load more"     │
            └───────────────────────────────────────────────────┘
```

Called once per query/filter combination; changing either aborts the previous run (`signal`) and starts a fresh one.

Adapter fields:

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | ✅ | Machine name, stored as `source` in documents |
| `title` | ✅ | Tab label |
| `fetch(ctx)` | ✅ | Load items — all at once, or page by page |
| `resolve(id)` | — | Re-fetch one item; enables **Refresh** |
| `filters` | — | Declarative filter bar (see below) |
| `icon` | — | Tab icon (`@sanity/icons` works great) |
| `defaultLayout` | — | `'grid'` (default) or `'list'` |
| `disableSearch` | — | Hide the search box for APIs without search |
| `searchPlaceholder` | — | Placeholder for the search box |
| `renderTile(props)` | — | Custom tile content (see below) |
| `renderPreview(props)` | — | Custom preview card on the input |

Items must extend this shape (`defineAdapter<MyItem>()` gives you typed context everywhere):

```ts
interface ExternalItem {
  id: string        // stable unique id — stored as externalId
  title?: string
  subtitle?: string
  imageUrl?: string
  raw?: unknown     // stored as the JSON payload (falls back to the item itself)
}
```

## Pagination recipes

There is no cursor plumbing — pagination state is ordinary local variables inside your generator:

```ts
// 1) No pagination — return everything (or the top N)
async fetch({query, signal}) {
  const res = await fetch(searchUrl(query), {signal})
  return mapItems(await res.json())
}

// 2) Offsets / page numbers — a loop counter
async *fetch({query, signal}) {
  for (let offset = 0; ; offset += LIMIT) {
    const json = await getJson(searchUrl(query, offset), signal)
    const items = json.results.map(mapItem)
    if (offset + LIMIT >= json.count) return items
    yield items
  }
}

// 3) Cursor tokens / next-page URLs — a mutable variable
async *fetch({query, signal}) {
  let url = firstUrl(query)
  while (true) {
    const json = await getJson(url, signal)
    if (!json.next) return mapItems(json)
    yield mapItems(json)
    url = json.next
  }
}
```

UI behavior:

- Each **Load more** click pulls one `yield`ed page and appends it. Duplicate ids are dropped, so overlapping pages are safe.
- `return` the last page (instead of `yield`ing it) when your API tells you it's the last — the **Load more** button hides immediately. If you only ever `yield`, the button hides one click later (the click that discovers the end).
- Changing the query, any filter, or the source tab **aborts the running fetch** (`ctx.signal`) and starts a fresh one.
- A thrown error shows inline with **Retry**. Retry restarts your `fetch`; items already on screen stay put and re-walked pages are skipped by the id-dedup.

## Filters

Declare filters; the plugin renders them (and collapses them into a "Filters" popover in narrow containers). Current values arrive **verbatim** in `ctx.filters` — mapping them to API params is your adapter's job.

```ts
filters: [
  {kind: 'select', name: 'category', title: 'Category', multiple: true,
   options: [{value: 'kitchen', title: 'Kitchen'}, {value: 'outdoors', title: 'Outdoors'}]},
  {kind: 'toggle', name: 'inStock', title: 'In stock only'},
  {kind: 'text', name: 'sku', title: 'SKU contains', placeholder: 'SKU-10…'},
  {kind: 'daterange', name: 'created', title: 'Created'}
]
```

| Kind | Control | Value in `ctx.filters` |
| --- | --- | --- |
| `select` | Dropdown with an "All" option | `string` |
| `select` + `multiple` | Checkbox popover | `string[]` |
| `toggle` | Switch | `true` (absent when off) |
| `text` | Debounced text input | `string` |
| `daterange` | Two native date inputs | `{from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD'}` |

Unset filters are **absent** from `ctx.filters`. Active filters show a count badge and a **Clear filters** action; every filter change refetches from page one.

## Custom stored shape

By default, selecting an item snapshots `externalId, title, subtitle, imageUrl` (plus the framework fields `_type, source, syncedAt`, and a `payload` string of the raw record). If you want a different shape — e.g. store **only the id**, or add custom fields — set `mapValue` on the adapter:

```ts
{name: 'products', ...,
 // Store only the id — framework fields (_type, source, syncedAt) still added.
 mapValue: item => ({externalId: item.id})}
```

```ts
{name: 'articles', ...,
 // Store a custom subset — headline, canonical url, published date.
 mapValue: item => ({
   externalId: item.id,
   headline: item.title,
   url: item.raw.canonicalUrl,
   publishedAt: item.raw.publishedAt
 })}
```

The keys you return replace the default item-derived fields. If you add fields that aren't declared in the plugin's schema (the built-in type has `source, externalId, title, subtitle, imageUrl, payload, syncedAt`), define your own type via `typeName` so those fields survive round-trip through the Studio form.

Combine with `storePayload: false` (plugin-level) to skip the JSON `payload` string entirely:

```ts
externalSource({storePayload: false})
```

## Custom tiles and previews

`renderTile` replaces a tile's **content** — the plugin keeps ownership of the grid/list layout, click & keyboard handling, and selection state:

```tsx
import {Badge, Box, Flex, Stack, Text} from '@sanity/ui'

renderTile({item, selected, query}) {
  return (
    <Flex align="center" gap={3}>
      <Box flex={1}>
        <Stack space={2}>
          <Text size={1} weight={selected ? 'bold' : 'medium'}>{item.title}</Text>
          <Text size={0} muted>{item.raw.sku}</Text>
        </Stack>
      </Box>
      <Badge tone={item.raw.inStock ? 'positive' : 'critical'}>
        {item.raw.inStock ? 'In stock' : 'Out of stock'}
      </Badge>
    </Flex>
  )
}
```

`renderPreview({value})` does the same for the selected-value card on the input; it receives the **stored** `ExternalItemValue` (parse `value.payload` for the full record).

Tip: build custom renderers with `@sanity/ui` primitives so they inherit the Studio theme (including dark mode) for free.

## Grid ⇄ list layout

Editors can toggle between a tile grid and rows — handy for data without imagery (e.g. financial records). The choice is persisted per adapter in `localStorage`. Set the initial layout with `defaultLayout: 'list'`.

## `createRestAdapter`

For plain JSON REST APIs you usually don't need to write `fetch` yourself:

```ts
createRestAdapter({
  name: 'articles',
  title: 'Articles',
  buildUrl: ctx => {
    // First page only — the factory follows `nextUrl` from there.
    const url = new URL('https://api.example.com/articles')
    if (ctx.query) url.searchParams.set('q', ctx.query)
    if (typeof ctx.filters.section === 'string') url.searchParams.set('section', ctx.filters.section)
    return url
  },
  nextUrl: json => json.nextPageUrl ?? null,               // null = no more pages; omit for single-page APIs
  headers: () => ({Authorization: `Bearer ${myToken}`}), // static object or (async) factory
  selectItems: json => json.data.hits,
  mapItem: raw => ({id: String(raw.id), title: raw.headline, imageUrl: raw.thumb, raw}),
  resolveUrl: id => `https://api.example.com/articles/${id}`, // enables Refresh; 404 → "item gone"
  mapResolved: json => json.data
})
```

Everything is explicit — the factory never guesses at your response shape.

| Option | Required | Purpose |
| --- | --- | --- |
| `buildUrl(ctx)` | ✅ | URL of the **first** page |
| `selectItems(json)` | ✅ | Pick the records array out of the response body |
| `mapItem(raw)` | ✅ | Map one raw record to an item |
| `nextUrl(json, ctx)` | — | URL of the **next** page (`null` = end). Omit for single-page APIs |
| `headers` | — | Static headers or an (async) per-request factory |
| `resolveUrl(id)` | — | Enables Refresh |
| `mapResolved(json)` | — | Unwrap the resolve response (default: identity) |
| `filters`, `icon`, `defaultLayout`, `disableSearch`, `searchPlaceholder`, `mapValue`, `renderTile`, `renderPreview` | — | Passed through |

Non-OK responses throw `HTTP <status> <statusText>` and surface inline in the dialog; `resolve` treats 404 as "item no longer exists".

## CORS and authentication

Adapters run **in the browser**, inside the Studio:

- The API must send CORS headers allowing your Studio origin (`http://localhost:3333` during development).
- **Never ship long-lived secrets to the browser.** For authenticated APIs, deploy a tiny serverless proxy (Cloudflare Worker, Vercel/Netlify function) that holds the credential and forwards requests; point `buildUrl` at the proxy.
- For editor-provided, per-studio secrets (API keys entered in the Studio UI), the established pattern is [`@sanity/studio-secrets`](https://github.com/sanity-io/sanity-studio-secrets) — store the key with it, read it in your adapter's `headers` factory.

## Plugin options

```ts
externalSource({
  typeName: 'external.item', // optional: rename the schema type
  storePayload: true         // optional: set false to skip storing the raw JSON
})
```

Custom `typeName` example — a dedicated `product.ref` type:

```ts
externalSource({typeName: 'product.ref'})
// …
defineField({
  name: 'product',
  type: 'product.ref',
  options: {adapters: [productsAdapter]}
})
```

## Field options

`options` on any `external.item` field:

| Key | Purpose |
| --- | --- |
| `adapters` | **Required.** Adapters this field can pick from. |
| `dialog.mode` | `'fullscreen'` (default) or `'centered'`. |
| `dialog.width` | For `mode: 'centered'`, the @sanity/ui width scale (0–4, default 1). |

## Dialog mode

The picker opens fullscreen by default. If you'd rather have a classic centered modal for a particular field, set `options.dialog` on the field:

```ts
defineField({
  name: 'featuredProduct',
  type: 'external.item',
  options: {dialog: {mode: 'centered'}} // or 'fullscreen'
})
```

For `mode: 'centered'` you can also set `width` (the @sanity/ui theme-container index, `0`–`4`; default `1`):

```ts
options: {dialog: {mode: 'centered', width: 3}}
```

Both modes close on `Escape` or the ✕ button. Grid tiles are keyboard accessible (`Tab` to focus, `Enter`/`Space` to select). With more than one adapter, tabs at the top switch sources.

## Editor UX details

- Tiles are keyboard accessible: `Tab` to a tile, `Enter`/`Space` to select, `Escape` closes the dialog.
- Fetch/resolve errors render as inline critical cards (with Retry) — the form never crashes.
- `readOnly` fields disable Select/Replace, Refresh and Clear.
- If a stored value references an adapter that is no longer registered, the input shows a warning and still lets you Clear or Replace it.

## Development

This repo ships a dev studio wired to three demo adapters (a hand-written PokeAPI generator with client-side search, an offline in-memory "Products" API demonstrating all filter kinds and custom renderers, and a `createRestAdapter` next-URL demo):

```sh
npm install
npm run dev   # starts the dev studio in ./dev
npm run build # plugin-kit verify + pkg-utils build
```

## License

[MIT](LICENSE) © Max Shastsel
