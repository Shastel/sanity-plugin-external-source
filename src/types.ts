import type {ComponentType, ReactNode} from 'react'

/**
 * Minimal shape every item returned by an adapter must satisfy.
 *
 * Adapters may return any richer type that extends this — the extra data is
 * available in `renderTile` and is persisted via {@link ExternalItemValue.payload}.
 */
export interface ExternalItem {
  /** Unique, stable identifier of the record in the external system. Stored as `externalId`. */
  id: string
  /** Human-readable title, shown on tiles and stored in the document. */
  title?: string
  /** Secondary line shown under the title. */
  subtitle?: string
  /** Absolute URL of a preview image. Omit for data without imagery. */
  imageUrl?: string
  /**
   * The raw upstream record. When payload storage is enabled the plugin stores
   * `JSON.stringify(raw ?? item)` in the document.
   */
  raw?: unknown
}

/**
 * The value stored in the Sanity document — a snapshot of the selected item.
 * All fields are declared in the schema and are queryable with GROQ.
 */
export interface ExternalItemValue {
  _type: string
  _key?: string
  /** `name` of the adapter the item was selected from. */
  source: string
  /** {@link ExternalItem.id} of the selected item. */
  externalId: string
  title?: string
  subtitle?: string
  imageUrl?: string
  /** `JSON.stringify` of the raw record (present unless `storePayload: false`). */
  payload?: string
  /** ISO-8601 datetime of the last time the snapshot was taken (select or refresh). */
  syncedAt: string
}

/**
 * Passed to {@link ExternalSourceAdapter.fetch} once per browse session
 * (a browse session = one query/filter combination).
 */
export interface FetchContext {
  /** Free-text search input. `''` when the search box is empty. */
  query: string
  /**
   * Current values of the adapter's filters, keyed by filter `name`.
   * Value shapes per filter kind: `select` → `string`, `select`+`multiple` → `string[]`,
   * `toggle` → `boolean`, `text` → `string`, `daterange` → {@link DateRangeValue}.
   * Unset filters are absent from the record.
   */
  filters: Record<string, unknown>
  /**
   * Abort signal covering the whole browse session — pass it to every request
   * you make so stale sessions are cancelled when the query or filters change.
   */
  signal: AbortSignal
}

/**
 * Returned from {@link ExternalSourceAdapter.fetch}: either everything at once
 * (`Promise` of items) or page by page (`AsyncIterable`, i.e. an `async *`
 * generator — each "Load more" click pulls one more page).
 */
export type FetchResult<TItem extends ExternalItem = ExternalItem> =
  | Promise<TItem[]>
  | AsyncIterable<TItem[]>

/** Single-choice (or multi-choice with `multiple`) dropdown filter. Value: `string` or `string[]`. */
export interface SelectFilterDefinition {
  kind: 'select'
  /** Key used in {@link FetchContext.filters}. */
  name: string
  /** Label shown in the filter bar. */
  title: string
  options: {value: string; title: string}[]
  /** Render as a multi-select (checkbox popover). Value becomes `string[]`. */
  multiple?: boolean
}

/** On/off switch filter. Value: `boolean`. */
export interface ToggleFilterDefinition {
  kind: 'toggle'
  name: string
  title: string
}

/** Free-text filter (debounced like the search box). Value: `string`. */
export interface TextFilterDefinition {
  kind: 'text'
  name: string
  title: string
  placeholder?: string
}

/** Date range filter with native date inputs. Value: {@link DateRangeValue}. */
export interface DateRangeFilterDefinition {
  kind: 'daterange'
  name: string
  title: string
}

/** Declarative filter rendered by the plugin in the dialog's filter bar. */
export type FilterDefinition =
  | SelectFilterDefinition
  | ToggleFilterDefinition
  | TextFilterDefinition
  | DateRangeFilterDefinition

/** Value produced by a `daterange` filter. Dates are `YYYY-MM-DD` strings. */
export interface DateRangeValue {
  from?: string
  to?: string
}

/** Props passed to a custom {@link ExternalSourceAdapter.renderTile} renderer. */
export interface TileProps<TItem extends ExternalItem = ExternalItem> {
  item: TItem
  /** True when this item is the currently selected value of the field. */
  selected: boolean
  /** The active search query, e.g. for highlighting. */
  query: string
}

/** Result layout inside the dialog. */
export type ItemLayout = 'grid' | 'list'

/**
 * Per-field dialog configuration. Set via `options.dialog` on the field:
 *
 * ```ts
 * defineField({
 *   name: 'featuredProduct',
 *   type: 'external.item',
 *   options: {dialog: {mode: 'centered'}}
 * })
 * ```
 */
export interface DialogOptions {
  /**
   * `'fullscreen'` (default): edge-to-edge modal. Best for browsing lots of tiles.
   * `'centered'`: a classic centered modal. Feels more embedded in the Studio.
   */
  mode?: 'fullscreen' | 'centered'
  /**
   * For `mode: 'centered'`, the theme-container width index (0–4, narrow → wide).
   * Ignored in fullscreen mode. Default: `1`.
   */
  width?: 0 | 1 | 2 | 3 | 4
}

/** Field-level options for `external.item`, accessed via `defineField({options: {...}})`. */
export interface ExternalItemFieldOptions {
  /**
   * Adapters this field can pick from. **Required** on every `external.item` field:
   * adapters are configured per-field, not plugin-wide.
   */
  adapters?: ExternalSourceAdapter[]
  /** Per-field dialog behavior — see {@link DialogOptions}. */
  dialog?: DialogOptions
}

/**
 * Connects one external API to the picker. Register adapters per field via
 * `options: {adapters: [...]}` — see {@link ExternalItemFieldOptions.adapters}.
 */
export interface ExternalSourceAdapter<TItem extends ExternalItem = ExternalItem> {
  /** Machine name, stored in the document as `source`. Must be unique across adapters. */
  name: string
  /** Human-readable label, used as the dialog tab title. */
  title: string
  /** Optional icon for the tab and preview badge. */
  icon?: ComponentType
  /** Filters rendered by the plugin in the dialog's filter bar. */
  filters?: FilterDefinition[]
  /** Initial layout for this adapter's results. Editors can toggle it (persisted). Default: `'grid'`. */
  defaultLayout?: ItemLayout
  /** Hide the free-text search box (for APIs without search). */
  disableSearch?: boolean
  /** Placeholder for the search box. Default: `'Search…'`. */
  searchPlaceholder?: string
  /**
   * Customize the stored value's shape. Return the fields you want to store
   * from a selected item; the plugin adds `_type`, `_key`, `source`, `syncedAt`
   * (and `payload` unless `storePayload: false`) on top.
   *
   * If omitted, the default snapshot is `externalId`, `title`, `subtitle`,
   * `imageUrl` (each included only when set on the item).
   *
   * See the README's "Custom stored shape" section for examples.
   */
  mapValue?(item: TItem): Record<string, unknown>
  /**
   * Load results. Called once per query/filter combination; pagination is
   * entirely yours. Two forms:
   *
   * - `async fetch(ctx)` returning all items — for APIs where one request is
   *   enough.
   * - `async *fetch(ctx)` yielding pages — the dialog pulls one page per
   *   "Load more" click. Keep pagination state in local variables.
   *
   * When a generator `return`s (instead of `yield`ing) a page it knows is
   * last, the dialog hides "Load more" immediately; otherwise it takes one
   * extra click to discover the end.
   *
   * Errors thrown here are shown inline in the dialog with a Retry action.
   * Retry restarts the iteration from scratch (already-listed items are
   * kept and deduplicated by id).
   *
   * See the README's "Writing an adapter" and "Pagination recipes" for
   * worked examples.
   */
  fetch(ctx: FetchContext): FetchResult<TItem>
  /**
   * Re-fetch a single item by id. Enables the "Refresh" action on the input,
   * which re-snapshots the stored value. Return `null` if the item no longer exists.
   */
  resolve?(id: string): Promise<TItem | null>
  /**
   * Custom tile content. The plugin still owns grid/list layout, click and
   * keyboard handling, and selection state — this only replaces what's inside a tile.
   */
  renderTile?(props: TileProps<TItem>): ReactNode
  /** Custom preview card content for the selected value on the input. */
  renderPreview?(props: {value: ExternalItemValue}): ReactNode
}

/** Default schema type name for the stored object. */
export const DEFAULT_TYPE_NAME = 'external.item'

/**
 * Plugin configuration. Adapters live on individual fields, not here —
 * see {@link ExternalItemFieldOptions.adapters}.
 */
export interface ExternalSourceConfig {
  /** Schema type name for the stored object. Default: `'external.item'`. */
  typeName?: string
  /** Store `JSON.stringify` of the raw record in `payload`. Default: `true`. */
  storePayload?: boolean
}

/**
 * Identity helper for authoring adapters with a typed item:
 * `defineAdapter<Pokemon>({...})` gives you typed `ctx`, `resolve` and `renderTile`.
 */
export function defineAdapter<TItem extends ExternalItem>(
  adapter: ExternalSourceAdapter<TItem>
): ExternalSourceAdapter<TItem> {
  return adapter
}
