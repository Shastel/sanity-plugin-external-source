import {definePlugin} from 'sanity'

import {createExternalItemType} from './schema'
import type {ExternalSourceConfig} from './types'

/**
 * Generic visual picker for external data.
 *
 * ```ts
 * // sanity.config.ts
 * import {defineConfig} from 'sanity'
 * import {externalSource} from 'sanity-plugin-external-source'
 *
 * export default defineConfig({
 *   // ...
 *   plugins: [externalSource({adapters: [myAdapter]})],
 * })
 * ```
 *
 * Then use the type in your schema: `defineField({name: 'product', type: 'external.item'})`.
 */
export const externalSource = definePlugin<ExternalSourceConfig | void>(rawConfig => {
  const config: ExternalSourceConfig = rawConfig ?? {}
  return {
    name: 'sanity-plugin-external-source',
    schema: {types: [createExternalItemType(config)]}
  }
})

export {createRestAdapter} from './adapters/rest'
export type {RestAdapterOptions} from './adapters/rest'
export {DEFAULT_TYPE_NAME, defineAdapter} from './types'
export type {
  DateRangeFilterDefinition,
  DateRangeValue,
  DialogOptions,
  ExternalItem,
  ExternalItemFieldOptions,
  ExternalItemValue,
  ExternalSourceAdapter,
  ExternalSourceConfig,
  FetchContext,
  FetchResult,
  FilterDefinition,
  ItemLayout,
  SelectFilterDefinition,
  TextFilterDefinition,
  TileProps,
  ToggleFilterDefinition
} from './types'
