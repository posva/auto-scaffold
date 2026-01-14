import { defineQueryOptions } from '@pinia/colada'

export const QUERY_KEYS = {
  root: ['root'] as const,
  byId: (id: string) => [...QUERY_KEYS.root, id] as const,
}

export const byIdQuery = defineQueryOptions(({ id }: { id: string }) => ({
  key: QUERY_KEYS.byId(id),
  query: () => Promise.reject('TODO:'),
}))
