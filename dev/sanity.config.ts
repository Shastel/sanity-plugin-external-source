import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {externalSource} from '../src'
import {dataset, projectId} from './project'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'external-source dev',
  projectId,
  dataset,
  plugins: [structureTool(), externalSource()],
  schema: {types: schemaTypes}
})
