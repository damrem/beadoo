import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BeadDetail } from '@/components/BeadDetail'
import { Board } from '@/components/Board'
import { DatabaseSelector } from '@/components/DatabaseSelector'
import { EpicSidebar } from '@/components/EpicSidebar'
import { FilterBar } from '@/components/FilterBar'
import { RefreshButton } from '@/components/RefreshButton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { BeadList, DatabaseEntry } from '@/lib/api'
import { childrenOf, epicsOf, filterBeads, groupByParent, readViewState, writeViewState } from '@/lib/filters'
import type { StoredFilters, ViewState } from '@/lib/filters'

export const POLL_MS = 60_000

const STORAGE_KEY = 'beads-page:filters'

function readStored(): StoredFilters {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredFilters
  } catch {
    return {}
  }
}

function writeStored(filters: StoredFilters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    return
  }
}

export function App() {
  const [view, setView] = useState<ViewState>(() => readViewState(window.location.search, readStored()))
  const [databases, setDatabases] = useState<DatabaseEntry[] | null>(null)
  const [data, setData] = useState<BeadList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRead, setLastRead] = useState<Date | null>(null)
  const activeDb = useRef<string | null>(null)

  const update = (change: Partial<ViewState>) => setView((current) => ({ ...current, ...change }))

  useEffect(() => {
    window.history.replaceState(null, '', writeViewState(view))
    writeStored({ status: view.status, text: view.text })
  }, [view])

  useEffect(() => {
    api
      .databases()
      .then((list) => {
        setDatabases(list)
        setView((current) =>
          current.db && list.some((db) => db.name === current.db)
            ? current
            : { ...current, db: (list.find((db) => !db.refused) ?? list[0])?.name ?? null },
        )
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  const selectedDb = databases?.find((db) => db.name === view.db) ?? null

  const refresh = useCallback(() => {
    if (!selectedDb || selectedDb.refused) return
    const name = selectedDb.name
    const current = () => activeDb.current === name
    setLoading(true)
    api
      .beads(name)
      .then((list) => {
        if (!current()) return
        setData(list)
        setError(null)
        setLastRead(new Date())
      })
      .catch((reason: Error) => current() && setError(reason.message))
      .finally(() => current() && setLoading(false))
  }, [selectedDb])

  useEffect(() => {
    activeDb.current = selectedDb?.name ?? null
    setData(null)
    setError(null)
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh, selectedDb])

  const groups = useMemo(() => groupByParent(data?.beads ?? []), [data])

  const epics = useMemo(() => (data ? epicsOf(data.beads, groups, view.status) : []), [data, groups, view.status])

  const epic = useMemo(() => {
    if (view.epic && epics.some((entry) => entry.id === view.epic)) return view.epic
    if (!data) return null
    const withBeads = epics.find(
      (entry) => filterBeads(childrenOf(groups, entry.id), data.readyIds, view.status, view.text).length > 0,
    )
    return (withBeads ?? epics[0])?.id ?? null
  }, [data, groups, epics, view.epic, view.status, view.text])

  const boardBeads = useMemo(
    () => (data && epic ? filterBeads(childrenOf(groups, epic), data.readyIds, view.status, view.text) : []),
    [data, groups, epic, view.status, view.text],
  )

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <h1 className="font-heading text-base font-semibold">Beads</h1>
        <DatabaseSelector
          databases={databases ?? []}
          value={view.db}
          onChange={(db) => update({ db, epic: null, bead: null })}
        />
        <FilterBar
          status={view.status}
          text={view.text}
          onStatus={(status) => update({ status })}
          onText={(text) => update({ text })}
        />
        <div className="ml-auto">
          <RefreshButton lastRead={lastRead} loading={loading} onRefresh={refresh} />
        </div>
      </header>

      {selectedDb?.refused && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertTitle>The page does not read the database "{selectedDb.name}"</AlertTitle>
          <AlertDescription>{selectedDb.refused}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertTitle>The page could not read the beads</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!selectedDb?.refused && (
        <div className="flex min-h-0 flex-1">
          {data ? (
            <>
              <EpicSidebar epics={epics} selected={epic} onSelect={(id) => update({ epic: id })} />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
                <Board beads={boardBeads} onOpen={(id) => update({ bead: id })} />
              </main>
            </>
          ) : (
            !error && <Skeleton aria-label="Loading the beads" className="m-4 h-64 flex-1" />
          )}
        </div>
      )}

      {view.db && (
        <BeadDetail
          db={view.db}
          id={view.bead}
          onClose={() => update({ bead: null })}
          onOpen={(id) => update({ bead: id })}
        />
      )}
    </div>
  )
}
