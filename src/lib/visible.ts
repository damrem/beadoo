import { create } from 'zustand'

type VisibleBeads = { ids: Set<string> | null; show: (ids: string[] | null) => void }

export const useVisibleBeads = create<VisibleBeads>((set) => ({
  ids: null,
  show: (ids) => set({ ids: ids && new Set(ids) }),
}))

export function shownCount(related: string[], visible: Set<string> | null): string {
  const shown = visible ? related.filter((id) => visible.has(id)).length : related.length
  return shown === related.length ? `${related.length}` : `${shown}/${related.length}`
}
