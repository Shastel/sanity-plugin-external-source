import {defineCliConfig} from 'sanity/cli'

import {dataset, projectId} from './project'

export default defineCliConfig({api: {projectId, dataset}})
