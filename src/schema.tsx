import {PlugIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {createExternalItemInput} from './ExternalItemInput'
import {DEFAULT_TYPE_NAME, type ExternalSourceConfig} from './types'

/** Object type holding the snapshot of a selected external item. */
export function createExternalItemType(config: ExternalSourceConfig) {
  const typeName = config.typeName ?? DEFAULT_TYPE_NAME

  return defineType({
    name: typeName,
    title: 'External item',
    type: 'object',
    icon: PlugIcon,
    components: {input: createExternalItemInput(config)},
    fields: [
      defineField({
        name: 'source',
        type: 'string',
        title: 'Source',
        description: 'Name of the adapter the item was selected from'
      }),
      defineField({name: 'externalId', type: 'string', title: 'External ID'}),
      defineField({name: 'title', type: 'string', title: 'Title'}),
      defineField({name: 'subtitle', type: 'string', title: 'Subtitle'}),
      defineField({name: 'imageUrl', type: 'url', title: 'Image URL'}),
      defineField({
        name: 'payload',
        type: 'text',
        title: 'Payload',
        description: 'JSON snapshot of the raw external record'
      }),
      defineField({name: 'syncedAt', type: 'datetime', title: 'Synced at'})
    ],
    preview: {
      select: {title: 'title', source: 'source', imageUrl: 'imageUrl'},
      prepare({title, source, imageUrl}) {
        return {
          title: typeof title === 'string' && title ? title : 'External item',
          subtitle: typeof source === 'string' ? source : undefined,
          media: typeof imageUrl === 'string' && imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          ) : (
            PlugIcon
          )
        }
      }
    }
  })
}
