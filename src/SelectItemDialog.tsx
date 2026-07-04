import {ErrorOutlineIcon} from '@sanity/icons'
import {
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Grid,
  PortalProvider,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Text
} from '@sanity/ui'
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react'
import styled from 'styled-components'

import {countActiveFilters, FilterBar} from './FilterBar'
import {errorMessage, isAbortError, useDebouncedValue, useStoredLayout} from './hooks'
import {ItemTile, TileSkeleton} from './Tile'
import type {
  DialogOptions,
  ExternalItem,
  ExternalItemValue,
  ExternalSourceAdapter,
  FetchResult,
  ItemLayout
} from './types'

// Fullscreen mode fights @sanity/ui's own inline sizing — hence the !important's
const DialogWrapper = styled(Dialog)<{$mode: 'fullscreen' | 'centered'}>`
  ${({$mode}) =>
    $mode === 'fullscreen' &&
    `
    && {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100vh !important;
      max-height: 100vh !important;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
      z-index: 200000 !important;
    }
    && [data-ui='DialogCard'] {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }
    /* Inner card holding header/content/footer — direct child only, so we don't touch header/footer Cards */
    && [data-ui='DialogCard'] > [data-ui='Card'] {
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      border-radius: 0 !important;
    }
  `}
`

export interface SelectItemDialogProps {
  adapters: ExternalSourceAdapter[]
  /** Tab to open initially (e.g. the source of the current value). */
  initialAdapterName?: string
  /** Current field value, used to highlight the selected tile. */
  currentValue?: ExternalItemValue
  /** Per-field dialog configuration (mode, width). */
  dialogOptions?: DialogOptions
  onSelect: (adapter: ExternalSourceAdapter, item: ExternalItem) => void
  onClose: () => void
}

export function SelectItemDialog(props: SelectItemDialogProps): ReactNode {
  const {adapters, initialAdapterName, currentValue, dialogOptions, onSelect, onClose} = props
  const mode = dialogOptions?.mode ?? 'fullscreen'
  const centeredWidth = dialogOptions?.width ?? 1

  const [activeName, setActiveName] = useState<string>(() =>
    adapters.some(adapter => adapter.name === initialAdapterName)
      ? (initialAdapterName as string)
      : (adapters[0] as ExternalSourceAdapter).name
  )
  const adapter =
    adapters.find(candidate => candidate.name === activeName) ?? (adapters[0] as ExternalSourceAdapter)

  const handleSelect = useCallback(
    (item: ExternalItem) => onSelect(adapter, item),
    [adapter, onSelect]
  )

  // `key={adapter.name}` remounts the pane per tab: query, filters, loaded
  // results and layout all reset when switching sources.
  const pane = (
    <AdapterPane
      key={adapter.name}
      adapter={adapter}
      currentValue={currentValue}
      onSelect={handleSelect}
    />
  )

  // Escape Studio's per-pane portal (trapped inside a PaneLayout stacking
  // context) so the fullscreen dialog sits above the Studio's own top nav
  return (
    <PortalProvider element={typeof document === 'undefined' ? null : document.body}>
      <DialogWrapper
        id="external-source-select-dialog"
        header="Select item"
        onClose={onClose}
        width={mode === 'fullscreen' ? 4 : centeredWidth}
        position={mode === 'fullscreen' ? 'fixed' : 'absolute'}
        animate
        $mode={mode}
      >
        <Box padding={4}>
          <Stack space={4}>
            {adapters.length > 1 && (
              <TabList space={2}>
                {adapters.map(candidate => (
                  <Tab
                    key={candidate.name}
                    id={`external-source-tab-${candidate.name}`}
                    aria-controls={`external-source-panel-${candidate.name}`}
                    label={candidate.title}
                    icon={candidate.icon}
                    selected={candidate.name === adapter.name}
                    onClick={() => setActiveName(candidate.name)}
                    fontSize={1}
                  />
                ))}
              </TabList>
            )}
            {adapters.length > 1 ? (
              <TabPanel
                id={`external-source-panel-${adapter.name}`}
                aria-labelledby={`external-source-tab-${adapter.name}`}
              >
                {pane}
              </TabPanel>
            ) : (
              pane
            )}
          </Stack>
        </Box>
      </DialogWrapper>
    </PortalProvider>
  )
}

type Status = 'loading' | 'loadingMore' | 'loaded' | 'error'

interface ResultsState {
  items: ExternalItem[]
  status: Status
  hasMore: boolean
  error: string | undefined
}

const INITIAL_STATE: ResultsState = {
  items: [],
  status: 'loading',
  hasMore: false,
  error: undefined
}

// Bounds the pull loop for adapters that yield empty/duplicate pages forever
const MAX_PULLS_PER_ACTION = 50

type PageIterator = AsyncIterator<ExternalItem[], unknown>

// One run of adapter.fetch: abort cancels its requests, return() runs its finally blocks
interface Generation {
  controller: AbortController
  iterator: PageIterator
}

/** Normalize both `fetch` forms; a plain promise becomes a single final page. */
function toPageIterator(result: FetchResult): PageIterator {
  if (Symbol.asyncIterator in result) {
    return result[Symbol.asyncIterator]()
  }
  let consumed = false
  return {
    async next() {
      if (consumed) {
        return {value: undefined, done: true}
      }
      consumed = true
      return {value: await result, done: true}
    }
  }
}

function closeIterator(iterator: PageIterator): void {
  try {
    void iterator.return?.().catch(() => undefined)
  } catch {
    // adapter cleanup is best-effort
  }
}

interface AdapterPaneProps {
  adapter: ExternalSourceAdapter
  currentValue?: ExternalItemValue
  onSelect: (item: ExternalItem) => void
}

function AdapterPane({adapter, currentValue, onSelect}: AdapterPaneProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 350)
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [layout, setLayout] = useStoredLayout(adapter.name, adapter.defaultLayout ?? 'grid')
  const [state, setState] = useState<ResultsState>(INITIAL_STATE)
  const generationRef = useRef<Generation | null>(null)

  // Pulls until at least one new item lands or the iterator completes — this
  // makes retry (which restarts the iterator) fast-forward past re-walked pages
  const pull = useCallback(async (generation: Generation, base: ExternalItem[]) => {
    const {controller, iterator} = generation
    const seen = new Set(base.map(item => item.id))
    try {
      for (let i = 0; i < MAX_PULLS_PER_ACTION; i++) {
        const result = await iterator.next()
        if (controller.signal.aborted) {
          return
        }
        const page = Array.isArray(result.value) ? (result.value as ExternalItem[]) : []
        const fresh = page.filter(item => {
          if (seen.has(item.id)) {
            return false
          }
          seen.add(item.id)
          return true
        })
        if (result.done || fresh.length > 0) {
          setState({
            items: fresh.length > 0 ? [...base, ...fresh] : base,
            status: 'loaded',
            hasMore: !result.done,
            error: undefined
          })
          return
        }
      }
      setState({items: base, status: 'loaded', hasMore: false, error: undefined})
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) {
        return
      }
      setState(prev => ({...prev, status: 'error', error: errorMessage(err)}))
    }
  }, [])

  const startGeneration = useCallback(
    (base: ExternalItem[]) => {
      const previous = generationRef.current
      if (previous) {
        previous.controller.abort()
        closeIterator(previous.iterator)
      }
      const controller = new AbortController()
      const iterator = toPageIterator(
        adapter.fetch({query: debouncedQuery, filters, signal: controller.signal})
      )
      const generation: Generation = {controller, iterator}
      generationRef.current = generation
      setState({
        items: base,
        status: base.length > 0 ? 'loadingMore' : 'loading',
        hasMore: false,
        error: undefined
      })
      void pull(generation, base)
    },
    [adapter, debouncedQuery, filters, pull]
  )

  useEffect(() => {
    startGeneration([])
    return () => {
      const generation = generationRef.current
      if (generation) {
        generation.controller.abort()
        closeIterator(generation.iterator)
        generationRef.current = null
      }
    }
  }, [startGeneration])

  const loadMore = useCallback(() => {
    const generation = generationRef.current
    if (!generation || state.status !== 'loaded') {
      return
    }
    setState(prev => ({...prev, status: 'loadingMore', error: undefined}))
    void pull(generation, state.items)
  }, [pull, state.status, state.items])

  // A failed iterator is spent, so retry starts a fresh one — loaded items
  // stay on screen and `pull` fast-forwards past them
  const retry = useCallback(() => {
    startGeneration(state.items)
  }, [startGeneration, state.items])

  const busy = state.status === 'loading' || state.status === 'loadingMore'
  const activeFilterCount = countActiveFilters(adapter.filters ?? [], filters)

  return (
    <Stack space={4}>
      <FilterBar
        adapter={adapter}
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        layout={layout}
        onLayoutChange={setLayout}
      />

      {state.status === 'error' && (
        <Card tone="critical" padding={4} radius={2} border>
          <Flex align="flex-start" gap={3}>
            <Text size={1}>
              <ErrorOutlineIcon />
            </Text>
            <Box flex={1}>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Could not load items
                </Text>
                <Text size={1} muted>
                  {state.error}
                </Text>
              </Stack>
            </Box>
            <Button text="Retry" mode="ghost" fontSize={1} onClick={retry} />
          </Flex>
        </Card>
      )}

      {state.status === 'loading' && <ResultsSkeleton layout={layout} />}

      {state.status !== 'loading' && state.status !== 'error' && state.items.length === 0 && (
        <Card padding={5} radius={2} border style={{borderStyle: 'dashed'}}>
          <Text align="center" muted size={1}>
            {debouncedQuery || activeFilterCount > 0
              ? 'No results match your search or filters'
              : 'No items found'}
          </Text>
        </Card>
      )}

      {state.status !== 'loading' && state.items.length > 0 && (
        <ResultsList
          adapter={adapter}
          layout={layout}
          items={state.items}
          currentValue={currentValue}
          query={debouncedQuery}
          onSelect={onSelect}
        />
      )}

      {((state.status === 'loaded' && state.hasMore) || state.status === 'loadingMore') && (
        <Button
          text="Load more"
          mode="ghost"
          width="fill"
          loading={state.status === 'loadingMore'}
          disabled={busy}
          onClick={loadMore}
        />
      )}
    </Stack>
  )
}

interface ResultsListProps {
  adapter: ExternalSourceAdapter
  layout: ItemLayout
  items: ExternalItem[]
  currentValue?: ExternalItemValue
  query: string
  onSelect: (item: ExternalItem) => void
}

function ResultsList({adapter, layout, items, currentValue, query, onSelect}: ResultsListProps) {
  const isSelected = (item: ExternalItem) =>
    currentValue?.source === adapter.name && currentValue?.externalId === item.id

  const tiles = items.map(item => (
    <ItemTile
      key={`${adapter.name}:${item.id}`}
      adapter={adapter}
      item={item}
      layout={layout}
      selected={isSelected(item)}
      query={query}
      onSelect={onSelect}
    />
  ))

  if (layout === 'grid') {
    return (
      <Grid columns={[2, 3, 4, 5]} gap={3} role="listbox" aria-label={`${adapter.title} results`}>
        {tiles}
      </Grid>
    )
  }
  return (
    <Stack space={2} role="listbox" aria-label={`${adapter.title} results`}>
      {tiles}
    </Stack>
  )
}

function ResultsSkeleton({layout}: {layout: ItemLayout}) {
  if (layout === 'grid') {
    return (
      <Grid columns={[2, 3, 4, 5]} gap={3} aria-hidden>
        {Array.from({length: 8}).map((_, index) => (
          <TileSkeleton key={index} layout="grid" />
        ))}
      </Grid>
    )
  }
  return (
    <Stack space={2} aria-hidden>
      {Array.from({length: 6}).map((_, index) => (
        <TileSkeleton key={index} layout="list" />
      ))}
    </Stack>
  )
}
