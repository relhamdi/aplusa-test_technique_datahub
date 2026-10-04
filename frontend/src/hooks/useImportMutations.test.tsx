import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { json } from '../test/api'
import type { ImportSummary } from '../types/api'
import { importsKey } from './useImports'
import { useReorderImports } from './useImportMutations'

const make = (id: string): ImportSummary => ({
  id, name: id, description: '', order: 0, columns: [],
  row_count: 0, last_import: null, created_at: '', updated_at: '',
})
const a = make('a')
const b = make('b')

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(importsKey, [a, b])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

afterEach(() => vi.unstubAllGlobals())

describe('useReorderImports', () => {
  it('reorders the cache before the server answers', async () => {
    const { client, wrapper } = setup()
    let release!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (release = resolve))))

    const { result } = renderHook(() => useReorderImports(), { wrapper })
    act(() => result.current.mutate(['b', 'a']))

    await waitFor(() => expect(client.getQueryData(importsKey)).toEqual([b, a]))
    expect(result.current.isPending).toBe(true) // the request has not completed yet

    release(json([b, a]))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('restores the previous order when the server refuses', async () => {
    const { client, wrapper } = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'ids mismatch' }, 422)))

    const { result } = renderHook(() => useReorderImports(), { wrapper })
    act(() => result.current.mutate(['b', 'a']))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('ids mismatch')
    expect(client.getQueryData(importsKey)).toEqual([a, b])
  })
})