import {ImageIcon} from '@sanity/icons'
import {Box, Card, Flex, Skeleton, Stack, Text, TextSkeleton} from '@sanity/ui'
import {useState, type CSSProperties, type ReactNode} from 'react'

import type {ExternalItem, ExternalSourceAdapter, ItemLayout} from './types'

const focusRingStyle: CSSProperties = {
  outline: '2px solid var(--card-focus-ring-color, #2276fc)',
  outlineOffset: '2px'
}

const fillStyle: CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%'}

export interface ItemTileProps {
  adapter: ExternalSourceAdapter
  item: ExternalItem
  layout: ItemLayout
  selected: boolean
  query: string
  onSelect: (item: ExternalItem) => void
}

/**
 * Owns the interactive shell of a result (click, keyboard, selection state,
 * focus ring). The inner content comes from the adapter's `renderTile` when
 * provided, otherwise from the built-in grid tile / list row.
 */
export function ItemTile(props: ItemTileProps): ReactNode {
  const {adapter, item, layout, selected, query, onSelect} = props
  const [focused, setFocused] = useState(false)

  let content: ReactNode
  if (adapter.renderTile) {
    content = adapter.renderTile({item, selected, query})
  } else if (layout === 'grid') {
    content = <DefaultGridTile item={item} />
  } else {
    content = <DefaultListRow item={item} />
  }

  return (
    <Card
      as="button"
      type="button"
      role="option"
      aria-selected={selected}
      selected={selected}
      radius={2}
      padding={2}
      onClick={() => onSelect(item)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        ...(focused ? focusRingStyle : null)
      }}
    >
      {content}
    </Card>
  )
}

function ItemImage(props: {item: ExternalItem; width: number; height: number; iconSize: number}) {
  const {item, width, height, iconSize} = props
  const fixed = width > 0
  return (
    <Card
      radius={2}
      tone="transparent"
      style={{
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        ...(fixed ? {width, height} : {aspectRatio: '4 / 3', width: '100%'})
      }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          style={{...fillStyle, objectFit: 'cover'}}
        />
      ) : (
        <Flex align="center" justify="center" style={fillStyle}>
          <Text size={iconSize} muted>
            <ImageIcon />
          </Text>
        </Flex>
      )}
    </Card>
  )
}

function DefaultGridTile({item}: {item: ExternalItem}) {
  return (
    <Stack space={3}>
      <ItemImage item={item} width={0} height={0} iconSize={4} />
      <Stack space={2}>
        <Text size={1} weight="medium" textOverflow="ellipsis">
          {item.title ?? item.id}
        </Text>
        {item.subtitle ? (
          <Text size={0} muted textOverflow="ellipsis">
            {item.subtitle}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  )
}

function DefaultListRow({item}: {item: ExternalItem}) {
  return (
    <Flex align="center" gap={3}>
      <ItemImage item={item} width={48} height={36} iconSize={1} />
      <Box flex={1} style={{minWidth: 0}}>
        <Stack space={2}>
          <Text size={1} weight="medium" textOverflow="ellipsis">
            {item.title ?? item.id}
          </Text>
          {item.subtitle ? (
            <Text size={0} muted textOverflow="ellipsis">
              {item.subtitle}
            </Text>
          ) : null}
        </Stack>
      </Box>
    </Flex>
  )
}

export function TileSkeleton({layout}: {layout: ItemLayout}) {
  if (layout === 'grid') {
    return (
      <Card radius={2} padding={2}>
        <Stack space={3}>
          <Skeleton animated radius={2} style={{aspectRatio: '4 / 3', width: '100%'}} />
          <TextSkeleton animated radius={1} size={1} style={{width: '70%'}} />
        </Stack>
      </Card>
    )
  }
  return (
    <Card radius={2} padding={2}>
      <Flex align="center" gap={3}>
        <Skeleton animated radius={2} style={{width: 48, height: 36, flexShrink: 0}} />
        <Box flex={1}>
          <TextSkeleton animated radius={1} size={1} style={{width: '50%'}} />
        </Box>
      </Flex>
    </Card>
  )
}
