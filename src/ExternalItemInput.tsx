import {ErrorOutlineIcon, PlugIcon, SearchIcon, SyncIcon, TrashIcon, WarningOutlineIcon} from '@sanity/icons'
import {Badge, Box, Button, Card, Flex, Stack, Text, useToast} from '@sanity/ui'
import {useCallback, useState, type ComponentType, type CSSProperties} from 'react'
import {set, unset, type ObjectInputProps} from 'sanity'

import {errorMessage, formatRelativeTime} from './hooks'
import {SelectItemDialog} from './SelectItemDialog'
import type {
  DialogOptions,
  ExternalItem,
  ExternalItemFieldOptions,
  ExternalItemValue,
  ExternalSourceAdapter,
  ExternalSourceConfig
} from './types'

const fillStyle: CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%'}

function safeStringify(input: unknown): string | undefined {
  try {
    return JSON.stringify(input)
  } catch {
    return undefined
  }
}

function validateAdapters(adapters: ExternalSourceAdapter[], typeName: string): string | null {
  if (!Array.isArray(adapters) || adapters.length === 0) {
    return `No adapters configured. Add \`options: {adapters: [...]}\` to any \`${typeName}\` field.`
  }
  const seen = new Set<string>()
  for (const adapter of adapters) {
    if (!adapter?.name || typeof adapter.name !== 'string') {
      return 'Every adapter needs a non-empty `name`.'
    }
    if (seen.has(adapter.name)) {
      return `Duplicate adapter name "${adapter.name}" — adapter names must be unique per field.`
    }
    seen.add(adapter.name)
  }
  return null
}

/** Builds the input component bound to the plugin configuration. */
export function createExternalItemInput(config: ExternalSourceConfig): ComponentType<ObjectInputProps> {
  return function ExternalItemInput(props: ObjectInputProps) {
    const {onChange, readOnly, schemaType, elementProps} = props
    const value = props.value as ExternalItemValue | undefined
    const hasValue = Boolean(value?.externalId)
    const fieldOptions = (schemaType.options as ExternalItemFieldOptions | undefined) ?? {}
    const dialogOptions: DialogOptions = fieldOptions.dialog ?? {}
    const adapters = fieldOptions.adapters ?? []
    const adapterError = validateAdapters(adapters, schemaType.name)
    const adapter = hasValue
      ? adapters.find(candidate => candidate.name === value?.source)
      : undefined

    const [dialogOpen, setDialogOpen] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const toast = useToast()

    const snapshot = useCallback(
      (source: ExternalSourceAdapter, item: ExternalItem): ExternalItemValue => {
        const itemFields: Record<string, unknown> = source.mapValue
          ? source.mapValue(item)
          : {
              externalId: item.id,
              ...(item.title !== undefined && {title: item.title}),
              ...(item.subtitle !== undefined && {subtitle: item.subtitle}),
              ...(item.imageUrl !== undefined && {imageUrl: item.imageUrl})
            }

        const next: ExternalItemValue = {
          ...(itemFields as Partial<ExternalItemValue>),
          _type: schemaType.name,
          source: source.name,
          externalId: (itemFields.externalId as string | undefined) ?? item.id,
          syncedAt: new Date().toISOString()
        }
        if (value?._key) next._key = value._key
        if (config.storePayload !== false && next.payload === undefined) {
          const payload = safeStringify(item.raw ?? item)
          if (payload !== undefined) next.payload = payload
        }
        return next
      },
      [schemaType.name, value?._key]
    )

    const handleSelect = useCallback(
      (source: ExternalSourceAdapter, item: ExternalItem) => {
        onChange(set(snapshot(source, item)))
        setActionError(null)
        setDialogOpen(false)
      },
      [onChange, snapshot]
    )

    const handleClear = useCallback(() => {
      setActionError(null)
      onChange(unset())
    }, [onChange])

    const handleRefresh = useCallback(async () => {
      if (!value || !adapter?.resolve) {
        return
      }
      setRefreshing(true)
      setActionError(null)
      try {
        const item = await adapter.resolve(value.externalId)
        if (item === null) {
          toast.push({
            status: 'warning',
            title: 'Item not found in source',
            description: `“${value.title ?? value.externalId}” no longer exists in ${adapter.title}. The stored snapshot was kept.`
          })
        } else {
          onChange(set(snapshot(adapter, item)))
          toast.push({status: 'success', title: 'Item refreshed'})
        }
      } catch (err) {
        setActionError(errorMessage(err))
      } finally {
        setRefreshing(false)
      }
    }, [adapter, onChange, snapshot, toast, value])

    if (adapterError) {
      return (
        <Stack space={3} {...elementProps}>
          <Card tone="critical" padding={3} radius={2} border>
            <Flex align="flex-start" gap={3}>
              <Text size={1}>
                <ErrorOutlineIcon />
              </Text>
              <Stack space={2} flex={1}>
                <Text size={1} weight="medium">
                  external.item field misconfigured
                </Text>
                <Text size={1} muted>
                  {adapterError}
                </Text>
              </Stack>
            </Flex>
          </Card>
        </Stack>
      )
    }

    return (
      <Stack space={3} {...elementProps}>
        {hasValue && value ? (
          adapter ? (
            <PreviewCard value={value} adapter={adapter} />
          ) : (
            <Card tone="caution" padding={3} radius={2} border>
              <Flex align="center" gap={3}>
                <Text size={1}>
                  <WarningOutlineIcon />
                </Text>
                <Text size={1}>
                  Unknown source “{value.source}” — no adapter with that name is registered.
                </Text>
              </Flex>
            </Card>
          )
        ) : (
          <Card padding={4} radius={2} border style={{borderStyle: 'dashed'}}>
            <Text align="center" muted size={1}>
              No item selected
            </Text>
          </Card>
        )}

        {actionError && (
          <Card tone="critical" padding={3} radius={2} border>
            <Flex align="center" gap={3}>
              <Text size={1}>
                <ErrorOutlineIcon />
              </Text>
              <Text size={1}>{actionError}</Text>
            </Flex>
          </Card>
        )}

        <Flex gap={2}>
          <Button
            text={hasValue ? 'Replace' : 'Select'}
            icon={SearchIcon}
            mode="ghost"
            fontSize={1}
            onClick={() => setDialogOpen(true)}
            disabled={Boolean(readOnly)}
          />
          {hasValue && adapter?.resolve && (
            <Button
              text="Refresh"
              icon={SyncIcon}
              mode="ghost"
              fontSize={1}
              onClick={handleRefresh}
              loading={refreshing}
              disabled={Boolean(readOnly)}
            />
          )}
          {hasValue && (
            <Button
              text="Clear"
              icon={TrashIcon}
              mode="ghost"
              tone="critical"
              fontSize={1}
              onClick={handleClear}
              disabled={Boolean(readOnly)}
            />
          )}
        </Flex>

        {dialogOpen && (
          <SelectItemDialog
            adapters={adapters}
            initialAdapterName={adapter?.name}
            currentValue={hasValue ? value : undefined}
            dialogOptions={dialogOptions}
            onSelect={handleSelect}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </Stack>
    )
  }
}

function PreviewCard({value, adapter}: {value: ExternalItemValue; adapter: ExternalSourceAdapter}) {
  if (adapter.renderPreview) {
    return (
      <Card padding={3} radius={2} border>
        {adapter.renderPreview({value})}
      </Card>
    )
  }
  return (
    <Card padding={3} radius={2} border>
      <Flex align="center" gap={3}>
        <Card
          radius={2}
          tone="transparent"
          style={{width: 64, height: 48, position: 'relative', overflow: 'hidden', flexShrink: 0}}
        >
          {value.imageUrl ? (
            <img src={value.imageUrl} alt="" style={{...fillStyle, objectFit: 'cover'}} />
          ) : (
            <Flex align="center" justify="center" style={fillStyle}>
              <Text muted size={2}>
                <PlugIcon />
              </Text>
            </Flex>
          )}
        </Card>
        <Box flex={1} style={{minWidth: 0}}>
          <Stack space={2}>
            <Text size={1} weight="medium" textOverflow="ellipsis">
              {value.title ?? value.externalId}
            </Text>
            {value.subtitle ? (
              <Text size={1} muted textOverflow="ellipsis">
                {value.subtitle}
              </Text>
            ) : null}
            <Flex gap={2} align="center">
              <Badge tone="primary" fontSize={0}>
                {adapter.title}
              </Badge>
              {value.syncedAt ? (
                <Text size={0} muted>
                  Synced {formatRelativeTime(value.syncedAt)}
                </Text>
              ) : null}
            </Flex>
          </Stack>
        </Box>
      </Flex>
    </Card>
  )
}
