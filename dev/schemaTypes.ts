import {defineField, defineType} from 'sanity'

import {pokemonAdapter} from './adapters/pokemon'
import {pokemonRestAdapter} from './adapters/pokemonRest'
import {productsAdapter} from './adapters/products'

export const schemaTypes = [
  defineType({
    name: 'demoPage',
    title: 'Demo page',
    type: 'document',
    fields: [
      defineField({name: 'title', type: 'string', title: 'Title'}),
      defineField({
        name: 'heroItem',
        type: 'external.item',
        title: 'Hero item (all three adapters, fullscreen picker)',
        options: {
          adapters: [pokemonAdapter, productsAdapter, pokemonRestAdapter]
        }
      }),
      defineField({
        name: 'relatedItem',
        type: 'external.item',
        title: 'Related item (Products only, centered picker)',
        options: {
          adapters: [productsAdapter],
          dialog: {mode: 'centered'}
        }
      }),
      defineField({
        name: 'lockedItem',
        type: 'external.item',
        title: 'Locked item (read-only)',
        readOnly: true,
        options: {adapters: [pokemonAdapter]}
      })
    ]
  })
]
