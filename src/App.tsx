import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BeadDetail } from '@/components/BeadDetail'
import { BeadFilters } from '@/components/BeadFilters'
import { BeadGraph } from '@/components/BeadGraph'
import { BeadPage } from '@/components/BeadPage'
import { Board } from '@/components/Board'
import { cardActionsOf, CardNotice, useCardWrites } from '@/components/CardActions'
import { DatabaseSelector } from '@/components/DatabaseSelector'
import { EpicHeader } from '@/components/EpicHeader'
import { EpicLanes } from '@/components/EpicLanes'
import { EpicSidebar } from '@/components/EpicSidebar'
import { EpicTable } from '@/components/EpicTable'
import { Logo } from '@/components/Logo'
import { NoMatch } from '@/components/NoMatch'
import { RefreshButton } from '@/components/RefreshButton'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { UnreachableAlert } from '@/components/UnreachableAlert'
import { ViewSwitch } from '@/components/ViewSwitch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import { SpawnAllowed } from '@/lib/spawn-allowed'
import { beadAddressOf } from '@/lib/urls'
import { withBlockers } from '@/lib/blockers'
import { useVisibleBeads } from '@/lib/visible'
import { UNREACHABLE } from '../shared/contract'
import type { BeadList, DatabaseEntry } from '../shared/contract'
import {
  childrenOf,
  epicListOf,
  epicsOf,
  filterBeads,
  groupByParent,
  headerFilterOf,
  isEpic,
  lanesOf,
  readViewState,
  writeViewState,
} from '@/lib/filters'
import type { BeadFilter, StoredFilters, ViewState } from '@/lib/filters'

export const POLL_MS = 60_000

const STORAGE_KEY = 'beadoo:filters'

const LEGACY_STORAGE_KEY = 'beads-page:filters'

function readStored(): StoredFilters {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') as StoredFilters
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
  const address = beadAddressOf(window.location)
  return address ? <BeadPage db={address.db} id={address.id} /> : <Beads />
}

function Beads() {
  const [view, setView] = useState<ViewState>(() => readViewState(window.location.search, readStored()))
  const [databases, setDatabases] = useState<DatabaseEntry[] | null>(null)
  const [spawn, setSpawn] = useState(false)
  const [data, setData] = useState<BeadList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastRead, setLastRead] = useState<Date | null>(null)
  const [actor, setActor] = useState<string | null>(null)
  const activeDb = useRef<string | null>(null)

  const update = (change: Partial<ViewState>) => setView((current) => ({ ...current, ...change }))

  const updateFilter = (key: 'epicFilter' | 'boardFilter') => (change: Partial<BeadFilter>) =>
    setView((current) => ({ ...current, [key]: { ...current[key], ...change } }))

  useEffect(() => {
    window.history.replaceState(null, '', writeViewState(view))
    writeStored({
      status: view.status,
      text: view.text,
      view: view.mode,
      labels: view.labels,
      types: view.types,
      priorities: view.priorities,
      epics: view.epicFilter,
      board: view.boardFilter,
    })
  }, [view])

  useEffect(() => {
    api
      .databases()
      .then(({ databases: list, spawn: allowed }) => {
        setDatabases(list)
        setSpawn(allowed === true)
        setView((current) =>
          current.db && list.some((db) => db.name === current.db)
            ? current
            : { ...current, db: (list.find((db) => !db.refused) ?? list[0])?.name ?? null },
        )
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  const selectedDb = databases?.find((db) => db.name === view.db) ?? null

  const addDatabase = (path: string, name: string) =>
    api.addDatabase(path, name).then(({ databases: list }) => {
      const added = list.find((db) => !databases?.some((known) => known.name === db.name))
      setDatabases(list)
      if (added) update({ db: added.name, epic: null, bead: null })
      return list
    })

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
        setUnreachable(false)
        setLastRead(new Date())
      })
      .catch((reason: Error) => {
        if (!current()) return
        setError(reason.message)
        setUnreachable(reason instanceof ApiError && reason.code === UNREACHABLE)
      })
      .finally(() => current() && setLoading(false))
  }, [selectedDb])

  useEffect(() => {
    setActor(null)
    if (!selectedDb || selectedDb.refused) return
    let live = true
    api
      .actor(selectedDb.name)
      .then((name) => live && setActor(name || null))
      .catch(() => live && setActor(null))
    return () => {
      live = false
    }
  }, [selectedDb])

  useEffect(() => {
    activeDb.current = selectedDb?.name ?? null
    setData(null)
    setError(null)
    setUnreachable(false)
    setLastRead(null)
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh, selectedDb])

  const beads = useMemo(() => withBlockers(data?.beads ?? [], data?.readyIds), [data])

  const groups = useMemo(() => groupByParent(beads), [beads])

  const epics = useMemo(() => (data ? epicsOf(beads, groups, view.status) : []), [data, beads, groups, view.status])

  const filter = useMemo<BeadFilter>(
    () => headerFilterOf(view),
    [view.status, view.text, view.labels, view.types, view.priorities],
  )

  const lanes = useMemo(
    () => (data ? lanesOf(epics, groups, data.readyIds, filter, beads) : []),
    [data, beads, groups, epics, filter],
  )

  const parents = useMemo(() => beads.filter((bead) => isEpic(bead) || groups.has(bead.id)), [beads, groups])

  const epicList = useMemo(
    () => (data ? epicListOf(beads, groups, data.readyIds, view.epicFilter) : []),
    [data, beads, groups, view.epicFilter],
  )

  const epic = useMemo(() => {
    if (view.epic && epicList.some((lane) => lane.epic.id === view.epic)) return view.epic
    return epicList[0]?.epic.id ?? null
  }, [epicList, view.epic])

  const selectedEpic = epicList.find((lane) => lane.epic.id === epic)?.epic

  const epicChildren = useMemo(() => (epic ? childrenOf(groups, epic) : []), [groups, epic])

  const boardBeads = useMemo(
    () => (data ? filterBeads(epicChildren, data.readyIds, view.boardFilter) : []),
    [data, epicChildren, view.boardFilter],
  )

  const visibleIds = useMemo(
    () => (view.mode === 'epic' ? boardBeads : lanes.flatMap((lane) => lane.beads)).map((bead) => bead.id),
    [view.mode, boardBeads, lanes],
  )

  const showVisible = useVisibleBeads((state) => state.show)

  useEffect(() => showVisible(visibleIds), [showVisible, visibleIds])

  const open = (id: string) => update({ bead: id })

  const writes = useCardWrites(selectedDb && !selectedDb.refused ? selectedDb.name : null, refresh)

  const cardActions = cardActionsOf(actor, writes)

  return (
    <SpawnAllowed.Provider value={spawn}>
      <div className="flex h-dvh flex-col">
        <header className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
          <h1 className="flex items-center gap-1.5 font-heading text-base font-semibold">
            <Logo />
            beadoo
          </h1>
          <ViewSwitch mode={view.mode} onMode={(mode) => update({ mode })} />
          <DatabaseSelector
            databases={databases ?? []}
            value={view.db}
            onChange={(db) => update({ db, epic: null, bead: null })}
            onAdd={addDatabase}
          />
          <BeadFilters
            label="Filters"
            filter={filter}
            beads={beads}
            disabled={view.mode === 'epic'}
            onChange={update}
          />
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch />
            <RefreshButton lastRead={lastRead} loading={loading} onRefresh={refresh} />
          </div>
        </header>

        {selectedDb?.refused && (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTitle>The page does not read the database "{selectedDb.name}"</AlertTitle>
            <AlertDescription>{selectedDb.refused}</AlertDescription>
          </Alert>
        )}
        {error && unreachable && selectedDb && (
          <UnreachableAlert
            key={selectedDb.name}
            name={selectedDb.name}
            message={error}
            hasTunnel={Boolean(selectedDb.hasTunnel)}
            onStart={() => api.startTunnel(selectedDb.name).then(refresh)}
          />
        )}
        {error && !unreachable && (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTitle>The page could not read the beads</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <CardNotice writes={writes} />

        {!selectedDb?.refused && (
          <div className="flex min-h-0 flex-1">
            {data && view.mode === 'epic' ? (
              <>
                <EpicSidebar
                  lanes={epicList}
                  selected={epic}
                  onSelect={(id) => update({ epic: id })}
                  filters={
                    <BeadFilters
                      label="Epic filters"
                      filter={view.epicFilter}
                      beads={parents}
                      onChange={updateFilter('epicFilter')}
                    />
                  }
                />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
                  {selectedEpic && <EpicHeader epic={selectedEpic} onOpen={open} />}
                  {epic && (
                    <BeadFilters
                      label="Board filters"
                      filter={view.boardFilter}
                      beads={epicChildren}
                      onChange={updateFilter('boardFilter')}
                    />
                  )}
                  {boardBeads.length > 0 ? (
                    <Board beads={boardBeads} status={view.boardFilter.status} onOpen={open} cardActions={cardActions} />
                  ) : (
                    <NoMatch text={view.boardFilter.text} />
                  )}
                </main>
              </>
            ) : data ? (
              <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
                {view.mode === 'lanes' ? (
                  <EpicLanes lanes={lanes} status={view.status} onOpen={open} cardActions={cardActions} searchText={view.text} />
                ) : view.mode === 'graph' ? (
                  <BeadGraph lanes={lanes} beads={beads} onOpen={open} searchText={view.text} />
                ) : (
                  <EpicTable lanes={lanes} onOpen={open} cardActions={cardActions} searchText={view.text} />
                )}
              </main>
            ) : (
              !error && <Skeleton aria-label="Loading the beads" className="m-4 h-64 flex-1" />
            )}
          </div>
        )}

        {view.db && (
          <BeadDetail
            db={view.db}
            id={view.bead}
            actor={actor}
            beads={data?.beads}
            onClose={() => update({ bead: null })}
            onOpen={open}
            onWritten={refresh}
          />
        )}
      </div>
    </SpawnAllowed.Provider>
  )
}
