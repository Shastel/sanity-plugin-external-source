import {PackageIcon} from '@sanity/icons'
import {Badge, Box, Flex, Stack, Text} from '@sanity/ui'

import {defineAdapter, type ExternalItem} from '../../src'

interface ProductRecord {
  sku: string
  name: string
  category: string
  price: number
  inStock: boolean
  createdAt: string
}

interface Product extends ExternalItem {
  title: string
  raw: ProductRecord
}

const CATEGORIES = ['Electronics', 'Furniture', 'Stationery', 'Kitchen', 'Outdoors']
const ADJECTIVES = ['Aurora', 'Compact', 'Deluxe', 'Eco', 'Flex', 'Nova', 'Prime', 'Quantum', 'Retro', 'Solid']
const NOUNS = ['Desk', 'Lamp', 'Chair', 'Kettle', 'Notebook', 'Monitor', 'Tent', 'Blender', 'Shelf', 'Router', 'Whisk', 'Stool', 'Pad', 'Hub']

const PRODUCTS: Product[] = Array.from({length: 137}, (_, index) => {
  const sku = `SKU-${1000 + index}`
  const record: ProductRecord = {
    sku,
    name: `${ADJECTIVES[index % ADJECTIVES.length]} ${NOUNS[index % NOUNS.length]} ${100 + index}`,
    category: CATEGORIES[index % CATEGORIES.length] as string,
    price: Math.round((((index * 137) % 900) + 9.99) * 100) / 100,
    inStock: index % 3 !== 0,
    createdAt: new Date(Date.UTC(2024, 0, 1) + index * 5 * 86_400_000).toISOString()
  }
  return {
    id: sku,
    title: record.name,
    subtitle: record.category,
    raw: record
  }
})

const PAGE_SIZE = 12

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

function parsePayload(payload: string | undefined): ProductRecord | undefined {
  if (!payload) return undefined
  try {
    return JSON.parse(payload) as ProductRecord
  } catch {
    return undefined
  }
}

/**
 * In-memory mock API (works offline): a generator yielding PAGE_SIZE slices,
 * all four filter kinds, custom tile + preview renderers, list layout default,
 * simulated latency and a "Simulate error" toggle (fails every page — handy
 * for testing load-more errors and retry).
 */
export const productsAdapter = defineAdapter<Product>({
  name: 'products',
  title: 'Products',
  icon: PackageIcon,
  defaultLayout: 'list',
  searchPlaceholder: 'Search products…',
  filters: [
    {
      kind: 'select',
      name: 'category',
      title: 'Category',
      multiple: true,
      options: CATEGORIES.map(category => ({value: category, title: category}))
    },
    {kind: 'toggle', name: 'inStock', title: 'In stock only'},
    {kind: 'text', name: 'sku', title: 'SKU contains', placeholder: 'SKU-10…'},
    {kind: 'daterange', name: 'created', title: 'Created'},
    {kind: 'toggle', name: 'fail', title: 'Simulate error'}
  ],

  async *fetch(ctx) {
    const query = ctx.query.trim().toLowerCase()
    const categories = Array.isArray(ctx.filters.category) ? (ctx.filters.category as string[]) : []
    const inStockOnly = ctx.filters.inStock === true
    const sku = typeof ctx.filters.sku === 'string' ? ctx.filters.sku.toLowerCase() : ''
    const created = (ctx.filters.created ?? {}) as {from?: string; to?: string}

    const matches = PRODUCTS.filter(product => {
      const record = product.raw
      if (query && !product.title.toLowerCase().includes(query)) return false
      if (categories.length > 0 && !categories.includes(record.category)) return false
      if (inStockOnly && !record.inStock) return false
      if (sku && !record.sku.toLowerCase().includes(sku)) return false
      if (created.from && record.createdAt < created.from) return false
      if (created.to && record.createdAt > `${created.to}T23:59:59.999Z`) return false
      return true
    })

    for (let start = 0; ; start += PAGE_SIZE) {
      await delay(300, ctx.signal)
      if (ctx.filters.fail === true) {
        throw new Error('Simulated upstream failure — turn off the “Simulate error” filter')
      }
      const page = matches.slice(start, start + PAGE_SIZE)
      if (start + PAGE_SIZE >= matches.length) {
        return page
      }
      yield page
    }
  },

  async resolve(id) {
    await delay(200)
    return PRODUCTS.find(product => product.id === id) ?? null
  },

  renderTile({item, selected}) {
    const record = item.raw
    return (
      <Flex align="center" gap={3}>
        <Box flex={1} style={{minWidth: 0}}>
          <Stack space={2}>
            <Text size={1} weight={selected ? 'bold' : 'medium'} textOverflow="ellipsis">
              {item.title}
            </Text>
            <Text size={0} muted textOverflow="ellipsis">
              {record.sku} · {record.category}
            </Text>
          </Stack>
        </Box>
        <Badge tone={record.inStock ? 'positive' : 'critical'} fontSize={0}>
          {record.inStock ? 'In stock' : 'Out of stock'}
        </Badge>
        <Text size={1} weight="semibold">
          ${record.price.toFixed(2)}
        </Text>
      </Flex>
    )
  },

  renderPreview({value}) {
    const record = parsePayload(value.payload)
    return (
      <Flex align="center" gap={3}>
        <Box flex={1} style={{minWidth: 0}}>
          <Stack space={2}>
            <Text size={1} weight="medium" textOverflow="ellipsis">
              {value.title ?? value.externalId}
            </Text>
            <Text size={0} muted>
              {record ? `${record.sku} · $${record.price.toFixed(2)}` : value.subtitle}
            </Text>
          </Stack>
        </Box>
        {record ? (
          <Badge tone={record.inStock ? 'positive' : 'critical'} fontSize={0}>
            {record.inStock ? 'In stock' : 'Out of stock'}
          </Badge>
        ) : null}
      </Flex>
    )
  }
})
