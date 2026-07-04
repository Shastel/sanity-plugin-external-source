import {CalendarIcon, ChevronDownIcon, FilterIcon, SearchIcon, ThLargeIcon, UlistIcon} from '@sanity/icons'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Label,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  useClickOutsideEvent,
  useElementRect
} from '@sanity/ui'
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react'

import {useDebouncedValue} from './hooks'
import type {
  DateRangeFilterDefinition,
  DateRangeValue,
  ExternalSourceAdapter,
  FilterDefinition,
  ItemLayout,
  SelectFilterDefinition,
  TextFilterDefinition,
  ToggleFilterDefinition
} from './types'

/** Container width (px) below which filters collapse into a popover. */
const COLLAPSE_BREAKPOINT = 540

export function isFilterActive(def: FilterDefinition, value: unknown): boolean {
  switch (def.kind) {
    case 'select':
      return def.multiple
        ? Array.isArray(value) && value.length > 0
        : typeof value === 'string' && value !== ''
    case 'toggle':
      return value === true
    case 'text':
      return typeof value === 'string' && value.trim() !== ''
    case 'daterange': {
      const range = (value ?? {}) as DateRangeValue
      return Boolean(range.from || range.to)
    }
    default:
      return false
  }
}

export function countActiveFilters(
  defs: FilterDefinition[],
  filters: Record<string, unknown>
): number {
  return defs.reduce((count, def) => (isFilterActive(def, filters[def.name]) ? count + 1 : count), 0)
}

export interface FilterBarProps {
  adapter: ExternalSourceAdapter
  query: string
  onQueryChange: (query: string) => void
  filters: Record<string, unknown>
  onFiltersChange: (filters: Record<string, unknown>) => void
  layout: ItemLayout
  onLayoutChange: (layout: ItemLayout) => void
}

export function FilterBar(props: FilterBarProps): ReactNode {
  const {adapter, query, onQueryChange, filters, onFiltersChange, layout, onLayoutChange} = props
  const defs = adapter.filters ?? []
  const activeCount = countActiveFilters(defs, filters)

  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null)
  const rect = useElementRect(rootElement)
  const narrow = rect ? rect.width < COLLAPSE_BREAKPOINT : false

  const setFilter = useCallback(
    (name: string, value: unknown) => {
      const next = {...filters}
      if (value === undefined) {
        delete next[name]
      } else {
        next[name] = value
      }
      onFiltersChange(next)
    },
    [filters, onFiltersChange]
  )

  const clearFilters = useCallback(() => onFiltersChange({}), [onFiltersChange])

  const controls = defs.map(def => (
    <FilterControl key={def.name} def={def} value={filters[def.name]} onChange={setFilter} />
  ))

  return (
    <Stack ref={setRootElement} space={3}>
      <Flex gap={2} align="center">
        {adapter.disableSearch ? (
          <Box flex={1} />
        ) : (
          <Box flex={1}>
            <TextInput
              icon={SearchIcon}
              value={query}
              onChange={event => onQueryChange(event.currentTarget.value)}
              clearButton={query !== ''}
              onClear={() => onQueryChange('')}
              placeholder={adapter.searchPlaceholder ?? 'Search…'}
              fontSize={1}
              autoFocus
            />
          </Box>
        )}
        {narrow && defs.length > 0 && (
          <FiltersPopover activeCount={activeCount} onClear={clearFilters}>
            {controls}
          </FiltersPopover>
        )}
        <LayoutToggle layout={layout} onLayoutChange={onLayoutChange} />
      </Flex>

      {!narrow && defs.length > 0 && (
        <Flex gap={3} align="flex-end" wrap="wrap">
          {controls}
          {activeCount > 0 && (
            <Flex gap={2} align="center" paddingBottom={1}>
              <Badge tone="primary" fontSize={0}>
                {activeCount}
              </Badge>
              <Button
                text="Clear filters"
                mode="bleed"
                fontSize={1}
                padding={2}
                onClick={clearFilters}
              />
            </Flex>
          )}
        </Flex>
      )}
    </Stack>
  )
}

function LayoutToggle(props: {layout: ItemLayout; onLayoutChange: (layout: ItemLayout) => void}) {
  const {layout, onLayoutChange} = props
  return (
    <Flex gap={1}>
      <Button
        mode="bleed"
        selected={layout === 'grid'}
        icon={ThLargeIcon}
        onClick={() => onLayoutChange('grid')}
        aria-label="Grid layout"
        fontSize={1}
        padding={2}
      />
      <Button
        mode="bleed"
        selected={layout === 'list'}
        icon={UlistIcon}
        onClick={() => onLayoutChange('list')}
        aria-label="List layout"
        fontSize={1}
        padding={2}
      />
    </Flex>
  )
}

function FiltersPopover(props: {activeCount: number; onClear: () => void; children: ReactNode}) {
  const {activeCount, onClear, children} = props
  const [open, setOpen] = useState(false)
  const [buttonElement, setButtonElement] = useState<HTMLElement | null>(null)
  const [popoverElement, setPopoverElement] = useState<HTMLElement | null>(null)

  useClickOutsideEvent(
    () => setOpen(false),
    () => [buttonElement, popoverElement]
  )

  return (
    <Popover
      open={open}
      portal
      constrainSize
      placement="bottom-end"
      ref={setPopoverElement}
      content={
        <Stack space={4} padding={3} style={{minWidth: 220}}>
          {children}
          {activeCount > 0 && (
            <Button text="Clear filters" mode="ghost" fontSize={1} onClick={onClear} />
          )}
        </Stack>
      }
    >
      <Flex gap={2} align="center">
        <Button
          ref={setButtonElement}
          mode="ghost"
          icon={FilterIcon}
          text={activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
          fontSize={1}
          padding={2}
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
        />
      </Flex>
    </Popover>
  )
}

interface FilterControlProps {
  def: FilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}

function FilterControl({def, value, onChange}: FilterControlProps): ReactNode {
  switch (def.kind) {
    case 'select':
      return def.multiple ? (
        <MultiSelectFilter def={def} value={value} onChange={onChange} />
      ) : (
        <SingleSelectFilter def={def} value={value} onChange={onChange} />
      )
    case 'toggle':
      return <ToggleFilter def={def} value={value} onChange={onChange} />
    case 'text':
      return <TextFilter def={def} value={value} onChange={onChange} />
    case 'daterange':
      return <DateRangeFilter def={def} value={value} onChange={onChange} />
    default:
      return null
  }
}

function SingleSelectFilter(props: {
  def: SelectFilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  const {def, value, onChange} = props
  return (
    <Stack space={2}>
      <Label size={0} muted>
        {def.title}
      </Label>
      <Select
        fontSize={1}
        value={typeof value === 'string' ? value : ''}
        onChange={event => {
          const next = event.currentTarget.value
          onChange(def.name, next === '' ? undefined : next)
        }}
      >
        <option value="">All</option>
        {def.options.map(option => (
          <option key={option.value} value={option.value}>
            {option.title}
          </option>
        ))}
      </Select>
    </Stack>
  )
}

function MultiSelectFilter(props: {
  def: SelectFilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  const {def, value, onChange} = props
  const selectedValues = Array.isArray(value) ? (value as string[]) : []
  const [open, setOpen] = useState(false)
  const [buttonElement, setButtonElement] = useState<HTMLElement | null>(null)
  const [popoverElement, setPopoverElement] = useState<HTMLElement | null>(null)

  useClickOutsideEvent(
    () => setOpen(false),
    () => [buttonElement, popoverElement]
  )

  const toggleValue = (optionValue: string) => {
    const next = selectedValues.includes(optionValue)
      ? selectedValues.filter(item => item !== optionValue)
      : [...selectedValues, optionValue]
    onChange(def.name, next.length > 0 ? next : undefined)
  }

  return (
    <Stack space={2}>
      <Label size={0} muted>
        {def.title}
      </Label>
      <Popover
        open={open}
        portal
        constrainSize
        placement="bottom-start"
        ref={setPopoverElement}
        content={
          <Stack space={3} padding={3}>
            {def.options.map(option => (
              <Flex key={option.value} as="label" align="center" gap={2} style={{cursor: 'pointer'}}>
                <Checkbox
                  checked={selectedValues.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                />
                <Text size={1}>{option.title}</Text>
              </Flex>
            ))}
          </Stack>
        }
      >
        <Button
          ref={setButtonElement}
          mode="ghost"
          fontSize={1}
          padding={2}
          iconRight={ChevronDownIcon}
          text={selectedValues.length > 0 ? `${selectedValues.length} selected` : 'All'}
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
        />
      </Popover>
    </Stack>
  )
}

function ToggleFilter(props: {
  def: ToggleFilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  const {def, value, onChange} = props
  return (
    <Flex as="label" align="center" gap={2} paddingBottom={1} style={{cursor: 'pointer'}}>
      <Switch
        checked={value === true}
        onChange={event => onChange(def.name, event.currentTarget.checked ? true : undefined)}
      />
      <Text size={1}>{def.title}</Text>
    </Flex>
  )
}

function TextFilter(props: {
  def: TextFilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  const {def, value, onChange} = props
  const external = typeof value === 'string' ? value : ''
  const [draft, setDraft] = useState(external)
  const debounced = useDebouncedValue(draft, 350)

  const externalRef = useRef(external)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Adopt external resets (e.g. "Clear filters")
  useEffect(() => {
    externalRef.current = external
    setDraft(external)
  }, [external])

  // Push debounced edits out — deliberately only reacts to the debounced value
  useEffect(() => {
    if (debounced !== externalRef.current) {
      onChangeRef.current(def.name, debounced === '' ? undefined : debounced)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <Stack space={2}>
      <Label size={0} muted>
        {def.title}
      </Label>
      <TextInput
        fontSize={1}
        value={draft}
        placeholder={def.placeholder}
        onChange={event => setDraft(event.currentTarget.value)}
        clearButton={draft !== ''}
        onClear={() => setDraft('')}
      />
    </Stack>
  )
}

function DateRangeFilter(props: {
  def: DateRangeFilterDefinition
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  const {def, value, onChange} = props
  const range = (value && typeof value === 'object' ? value : {}) as DateRangeValue
  const [open, setOpen] = useState(false)
  const [buttonElement, setButtonElement] = useState<HTMLElement | null>(null)
  const [popoverElement, setPopoverElement] = useState<HTMLElement | null>(null)

  useClickOutsideEvent(
    () => setOpen(false),
    () => [buttonElement, popoverElement]
  )

  const update = (key: 'from' | 'to', raw: string) => {
    const next: DateRangeValue = {...range}
    if (raw) {
      next[key] = raw
    } else {
      delete next[key]
    }
    onChange(def.name, next.from || next.to ? next : undefined)
  }

  const label =
    range.from || range.to ? `${range.from ?? '…'} → ${range.to ?? '…'}` : 'Any time'

  return (
    <Stack space={2}>
      <Label size={0} muted>
        {def.title}
      </Label>
      <Popover
        open={open}
        portal
        constrainSize
        placement="bottom-start"
        ref={setPopoverElement}
        content={
          <Stack space={3} padding={3} style={{minWidth: 200}}>
            <Stack space={2}>
              <Label size={0} muted>
                From
              </Label>
              <TextInput
                type="date"
                fontSize={1}
                value={range.from ?? ''}
                onChange={event => update('from', event.currentTarget.value)}
              />
            </Stack>
            <Stack space={2}>
              <Label size={0} muted>
                To
              </Label>
              <TextInput
                type="date"
                fontSize={1}
                value={range.to ?? ''}
                onChange={event => update('to', event.currentTarget.value)}
              />
            </Stack>
            {(range.from || range.to) && (
              <Button
                text="Clear"
                mode="ghost"
                fontSize={1}
                onClick={() => onChange(def.name, undefined)}
              />
            )}
          </Stack>
        }
      >
        <Button
          ref={setButtonElement}
          mode="ghost"
          icon={CalendarIcon}
          text={label}
          fontSize={1}
          padding={2}
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
        />
      </Popover>
    </Stack>
  )
}
