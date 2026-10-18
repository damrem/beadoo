export const BEAD_PATH = '/bead'

export type BeadAddress = { db: string; id: string }

export const beadUrl = (db: string, id: string): string => `${BEAD_PATH}?${new URLSearchParams({ db, id }).toString()}`

export const boardUrl = (db: string): string => `/?${new URLSearchParams({ db }).toString()}`

export const absoluteUrl = (path: string): string => new URL(path, window.location.origin).href

export function beadAddressOf(location: { pathname: string; search: string }): BeadAddress | null {
  if (location.pathname !== BEAD_PATH) return null
  const params = new URLSearchParams(location.search)
  const db = params.get('db')
  const id = params.get('id')
  return db && id ? { db, id } : null
}
